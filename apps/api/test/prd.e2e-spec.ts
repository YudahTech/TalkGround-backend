/**
 * End-to-end tests of the PRD (§17 MVP acceptance criteria), against a real Postgres.
 * Each "user" is a supertest agent that keeps its HttpOnly session cookies, exactly like a browser.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5544/talkground_test npm run test:e2e
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

const ORIGIN = 'http://localhost:3000';
const API = '/api/v1';

let app: INestApplication;
let prisma: PrismaService;
let ipCounter = 10;

type Agent = ReturnType<typeof request.agent>;

/** A browser-like client: cookie jar + its own client IP + an allowed Origin on writes. */
class Client {
  readonly agent: Agent;
  readonly ip = `10.0.0.${ipCounter++}`;
  constructor() {
    this.agent = request.agent(app.getHttpServer());
  }
  get(url: string) {
    return this.agent.get(API + url).set('X-Forwarded-For', this.ip);
  }
  post(url: string, body?: object) {
    return this.agent
      .post(API + url)
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', this.ip)
      .send(body ?? {});
  }
  patch(url: string, body?: object) {
    return this.agent
      .patch(API + url)
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', this.ip)
      .send(body ?? {});
  }
  put(url: string, body?: object) {
    return this.agent
      .put(API + url)
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', this.ip)
      .send(body ?? {});
  }
  delete(url: string, body?: object) {
    return this.agent
      .delete(API + url)
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', this.ip)
      .send(body ?? {});
  }
}

async function login(email: string, password = 'demo1234') {
  const c = new Client();
  const res = await c.post('/auth/login', { email, password });
  expect(res.status).toBe(201);
  return c;
}

/** Register + verify email (EMAIL_DEV_MODE returns the code). */
async function newVerifiedUser(username: string) {
  const c = new Client();
  const reg = await c.post('/auth/register', {
    email: `${username}@example.com`,
    password: 'Secret123!',
    displayName: username.replace('_', ' '),
    username,
  });
  expect(reg.status).toBe(201);
  const code = reg.body.data.devEmailCode;
  expect(code).toMatch(/^\d{6}$/);
  const ok = await c.post('/auth/verify-email/confirm', { otp: code });
  expect(ok.status).toBeLessThan(300);
  return c;
}

const ids: Record<string, string> = {};
const businessId = async (slug: string) =>
  (await prisma.business.findUniqueOrThrow({ where: { slug } })).id;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

let admin: Client;
let moderator: Client;
let consumer: Client;
let consumer2: Client;
let ownerCandidate: Client;

describe('AC1, AC18: accounts and cookie-only authentication', () => {
  it('registers with HttpOnly cookies and no tokens in the body', async () => {
    consumer = new Client();
    const res = await consumer.post('/auth/register', {
      email: 'e2e_consumer@example.com',
      password: 'Secret123!',
      displayName: 'E2E Consumer',
      username: 'e2e_consumer',
    });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toMatch(
      /"accessToken"|"refreshToken"/,
    );
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(
      cookies.some(
        (c) => c.startsWith('talkground_at=') && /HttpOnly/i.test(c),
      ),
    ).toBe(true);
    expect(
      cookies.some(
        (c) => c.startsWith('talkground_rt=') && /HttpOnly/i.test(c),
      ),
    ).toBe(true);
    ids.consumerCode = res.body.data.devEmailCode;
  });

  it('blocks reviewing until the email is verified', async () => {
    const res = await consumer.post('/reviews', {
      businessId: await businessId('adire-lane'),
      overallRating: 4,
      body: 'This should be rejected because the email address is not verified yet.',
    });
    expect(res.status).toBe(403);
  });

  it('verifies the email and loads the account', async () => {
    expect(
      (
        await consumer.post('/auth/verify-email/confirm', {
          otp: ids.consumerCode,
        })
      ).status,
    ).toBeLessThan(300);
    const me = await consumer.get('/users/me');
    expect(me.status).toBe(200);
    expect(me.body.data.emailVerified).toBe(true);
    expect(me.body.data.isStaff).toBe(false);
  });

  it('rejects protected calls without a cookie, and ignores Bearer headers', async () => {
    expect(
      (await request(app.getHttpServer()).get(`${API}/users/me`)).status,
    ).toBe(401);
    expect(
      (
        await request(app.getHttpServer())
          .get(`${API}/users/me`)
          .set('Authorization', 'Bearer x.y.z')
      ).status,
    ).toBe(401);
  });

  it('lets users choose what their public profile shows', async () => {
    expect(
      (
        await consumer.patch('/users/me', {
          location: 'Yaba, Lagos',
          bio: 'I review vendors.',
        })
      ).status,
    ).toBe(200);
    const pub = await new Client().get('/users/e2e_consumer');
    expect(pub.status).toBe(200);
    expect(pub.body.data.location).toBe('Yaba, Lagos');
    expect(JSON.stringify(pub.body)).not.toMatch(
      /e2e_consumer@example\.com|emailVerified|phone/,
    );
  });

  it('logs in the seeded staff and users', async () => {
    admin = await login('admin@revyu.ng', 'admin123');
    moderator = await login('moderator@example.com');
    consumer2 = await login('reviewer2@example.com');
    const me = await admin.get('/users/me');
    expect(me.body.data.isStaff).toBe(true);
    expect(me.body.data.staffRole.key).toBe('super_admin');
  });
});

describe('AC2, AC13, AC14: public discovery, ratings and insufficient data', () => {
  const guest = () => new Client();

  it('searches by name, partial name, handle, website and phone without signing in', async () => {
    const byName = await guest().get('/businesses?q=kemi');
    expect(byName.status).toBe(200);
    expect(byName.body.data[0].slug).toBe('kemi-s-closet');
    expect(
      (await guest().get('/businesses?q=kem%20clo')).body.data[0].slug,
    ).toBe('kemi-s-closet');
    expect(
      (await guest().get('/businesses?q=%40kemis_closet')).body.data[0].slug,
    ).toBe('kemi-s-closet');
    expect(
      (await guest().get('/businesses?q=kemiscloset.ng')).body.data[0].slug,
    ).toBe('kemi-s-closet');
    expect(
      (await guest().get('/businesses?q=0803%20123%204567')).body.data[0].slug,
    ).toBe('kemi-s-closet');
    expect(
      (await guest().get('/businesses?q=RC1234567')).body.data[0].slug,
    ).toBe('gadget-hub-ikeja');
  });

  it('filters by category, state and rating, and sorts', async () => {
    const cat = await guest().get('/businesses?category=electronics-gadgets');
    expect(cat.body.meta.total).toBe(3);
    const fct = await guest().get('/businesses?state=abuja');
    const slugs = fct.body.data.map((b: { slug: string }) => b.slug);
    expect(slugs).toEqual(
      expect.arrayContaining([
        'threadline-menswear',
        'kemi-s-closet',
        'swiftdrop-logistics',
      ]),
    );
    expect(slugs).not.toContain('adire-lane');
    const rated = await guest().get('/businesses?minRating=4');
    expect(rated.body.data.map((b: { slug: string }) => b.slug)).toEqual([
      'kemi-s-closet',
    ]);
    const most = await guest().get('/businesses?sort=most_reviewed');
    expect(most.body.data[0].slug).toBe('kemi-s-closet');
  });

  it('shows a numeric rating only with enough reviews, always with the count', async () => {
    const kemi = (await guest().get('/businesses/kemi-s-closet')).body.data;
    expect(kemi.rating.reviewCount).toBe(6);
    expect(kemi.rating.average).toBe(4.2);
    expect(kemi.rating.sufficientData).toBe(true);
    expect(kemi.rating.distribution).toHaveLength(5);
    expect(kemi.rating.dimensions).toHaveLength(5);
    expect(kemi.ownership.label).toBe('Ownership verified');
    const adire = (await guest().get('/businesses/adire-lane')).body.data;
    expect(adire.rating.reviewCount).toBe(2);
    expect(adire.rating.average).toBeNull();
    expect(adire.rating.message).toMatch(/Not enough reviews/);
  });

  it('publishes categories with their dimensions, Nigerian states and the rating rules', async () => {
    const cats = (await guest().get('/categories')).body.data;
    expect(cats).toHaveLength(6);
    const food = cats.find(
      (c: { slug: string }) => c.slug === 'food-restaurants',
    );
    const delivery = food.ratingDimensions.find(
      (d: { key: string }) => d.key === 'delivery_punctuality',
    );
    expect(delivery.required).toBe(false);
    expect((await guest().get('/locations')).body.data.states).toHaveLength(37);
    expect(
      (await guest().get('/meta/rating-methodology')).body.data.version,
    ).toBe('1.0');
  });
});

describe('AC3, AC4, AC5: submissions, admin listings, duplicates and merging', () => {
  it('accepts a consumer suggestion and sends known businesses to their listing', async () => {
    const res = await consumer.post('/business-submissions', {
      name: 'Lagos Shoe Plug',
      category: 'fashion-clothing',
      state: 'lagos',
      city: 'Lagos',
      identifiers: [{ type: 'instagram', value: '@lagosshoeplug' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending_review');
    ids.submission = res.body.data.id;

    const dup = await consumer.post('/business-submissions', {
      name: 'Kemi Closet Copy',
      category: 'fashion-clothing',
      identifiers: [{ type: 'INSTAGRAM', value: 'instagram.com/kemis_closet' }],
    });
    expect(dup.status).toBe(409);
    expect(JSON.stringify(dup.body)).toMatch(/Kemi/);
  });

  it('keeps suggestions private until staff approve them', async () => {
    expect((await new Client().get('/businesses/lagos-shoe-plug')).status).toBe(
      404,
    );
    const approve = await admin.post(
      `/admin/submissions/${ids.submission}/approve`,
      {},
    );
    expect(approve.status).toBe(200);
    expect((await new Client().get('/businesses/lagos-shoe-plug')).status).toBe(
      200,
    );
  });

  it('detects duplicates on admin create and allows an explicit override', async () => {
    const body = {
      name: 'Kemis Closet',
      category: 'fashion-clothing',
      locations: [{ state: 'lagos' }],
    };
    const first = await admin.post('/admin/businesses', body);
    expect(first.status).toBe(409);
    expect(first.body.error.message).toBeDefined();
    const forced = await admin.post('/admin/businesses', {
      ...body,
      confirmNotDuplicate: true,
    });
    expect(forced.status).toBe(201);
    ids.dupBusiness = forced.body.data.id;
    const scan = await admin.get('/admin/businesses/duplicates');
    expect(JSON.stringify(scan.body.data)).toMatch(/kemis-closet/);
  });

  it('merges a duplicate: reviews move, the old link redirects, ratings stay consistent', async () => {
    const r = await consumer.post('/reviews', {
      businessId: ids.dupBusiness,
      overallRating: 3,
      dimensions: [
        { key: 'product_service_quality', score: 3 },
        { key: 'value_for_money', score: 3 },
      ],
      body: 'Reviewing the duplicate listing so the merge has a review to move across.',
    });
    expect(r.status).toBe(201);
    const merge = await admin.post(
      `/admin/businesses/${ids.dupBusiness}/merge`,
      {
        targetId: await businessId('kemi-s-closet'),
        reason: 'Same Instagram vendor listed twice',
      },
    );
    expect(merge.status).toBe(200);
    const old = (await new Client().get('/businesses/kemis-closet')).body.data;
    expect(old.merged).toBe(true);
    expect(old.mergedInto.slug).toBe('kemi-s-closet');
    const kemi = (await new Client().get('/businesses/kemi-s-closet')).body
      .data;
    expect(kemi.rating.reviewCount).toBe(7);
    expect(kemi.alternativeNames).toContain('Kemis Closet');
  });
});

describe('AC8, AC12, AC15: reviews, dimensions, edits and helpful votes', () => {
  it('enforces the category dimensions', async () => {
    const gadget = await businessId('gadget-hub-ikeja');
    const missing = await consumer.post('/reviews', {
      businessId: gadget,
      overallRating: 2,
      dimensions: [{ key: 'product_service_quality', score: 2 }],
      body: 'The phone I bought had a faulty charging port and they took two weeks to fix it.',
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toMatch(/Please rate/);
    const unknown = await consumer.post('/reviews', {
      businessId: gadget,
      overallRating: 2,
      dimensions: [{ key: 'cleanliness', score: 2 }],
      body: 'The phone I bought had a faulty charging port and they took two weeks to fix it.',
    });
    expect(unknown.status).toBe(400);
  });

  it('publishes a review with honest labels', async () => {
    const res = await consumer.post('/reviews', {
      businessId: await businessId('gadget-hub-ikeja'),
      overallRating: 2,
      dimensions: [
        { key: 'product_service_quality', score: 2 },
        { key: 'customer_service', score: 1 },
        { key: 'value_for_money', score: 3 },
        { key: 'communication', score: 2 },
      ],
      title: 'Faulty charging port',
      body: 'The phone I bought had a faulty charging port and they took two weeks to fix it.',
      experienceDate: '2026-11-01',
    });
    expect(res.status).toBe(201);
    const review = res.body.data;
    ids.review = review.id;
    expect(review.status).toBe('published');
    expect(review.labels.map((l: { key: string }) => l.key)).toEqual([
      'account_verified',
    ]);
    expect(review.labels[0].description).toMatch(/does not prove/);
    expect(review.dimensions).toHaveLength(4);
  });

  it('allows one current review per business', async () => {
    const again = await consumer.post('/reviews', {
      businessId: await businessId('gadget-hub-ikeja'),
      overallRating: 5,
      dimensions: [
        { key: 'product_service_quality', score: 5 },
        { key: 'customer_service', score: 5 },
        { key: 'value_for_money', score: 5 },
      ],
      body: 'Trying to post a second review of the same business to boost or sink it.',
    });
    expect(again.status).toBe(409);
  });

  it('keeps edit history', async () => {
    const edit = await consumer.patch(`/reviews/${ids.review}`, {
      body: 'The phone had a faulty charging port. They fixed it after two weeks and apologised.',
      overallRating: 3,
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data.edited).toBe(true);
    expect(edit.body.data.editCount).toBe(1);
    const revs = await consumer.get(`/reviews/${ids.review}/revisions`);
    expect(revs.body.data).toHaveLength(1);
    expect(revs.body.data[0].overallRating).toBe(2);
    expect(
      (await consumer2.get(`/reviews/${ids.review}/revisions`)).status,
    ).toBe(403);
  });

  it('counts one changeable, removable helpful vote per user', async () => {
    const yes = await consumer2.put(`/reviews/${ids.review}/vote`, {
      helpful: true,
    });
    expect(yes.body.data).toEqual({ myVote: 'helpful', helpfulCount: 1 });
    const again = await consumer2.put(`/reviews/${ids.review}/vote`, {
      helpful: true,
    });
    expect(again.body.data.helpfulCount).toBe(1);
    const no = await consumer2.put(`/reviews/${ids.review}/vote`, {
      helpful: false,
    });
    expect(no.body.data).toEqual({ myVote: 'not_helpful', helpfulCount: 0 });
    const removed = await consumer2.delete(`/reviews/${ids.review}/vote`);
    expect(removed.body.data.myVote).toBeNull();
    expect(
      (await consumer.put(`/reviews/${ids.review}/vote`, { helpful: true }))
        .status,
    ).toBe(400);
  });

  it('keeps stored ratings equal to a fresh calculation (AC13)', async () => {
    const id = await businessId('gadget-hub-ikeja');
    const b = await prisma.business.findUniqueOrThrow({ where: { id } });
    const agg = await prisma.review.aggregate({
      where: {
        businessId: id,
        status: { in: ['PUBLISHED', 'UNDER_INVESTIGATION'] },
        supersededAt: null,
      },
      _count: { _all: true },
      _avg: { overallRating: true },
    });
    expect(b.reviewCount).toBe(agg._count._all);
    expect(b.ratingAverage).toBeCloseTo(agg._avg.overallRating ?? 0, 5);
  });

  it('requires Cloudinary for evidence uploads (AC9 path)', async () => {
    const res = await consumer.post(`/reviews/${ids.review}/evidence`, {
      kind: 'receipt',
      url: 'https://res.cloudinary.com/demo/image/authenticated/v1/talkground/evidence-private/receipt.jpg',
    });
    expect(res.status).toBe(503);
  });
});

describe('AC6, AC7, AC11: ownership claims, the business portal and responses', () => {
  it('accepts a claim and shows a pending claim publicly as unclaimed', async () => {
    ownerCandidate = await newVerifiedUser('gadget_owner');
    const gadget = await businessId('gadget-hub-ikeja');
    ids.gadget = gadget;
    const claim = await ownerCandidate.post(`/businesses/${gadget}/claims`, {
      method: 'manual_review',
      claimantRole: 'Owner',
      message:
        'I run the shop at Computer Village. My CAC number is RC1234567.',
    });
    expect(claim.status).toBe(201);
    ids.claim = claim.body.data.id;
    expect(
      (
        await ownerCandidate.post(`/businesses/${gadget}/claims`, {
          method: 'manual_review',
          claimantRole: 'Owner',
          message: 'again',
        })
      ).status,
    ).toBe(409);
    expect(
      (await new Client().get('/businesses/gadget-hub-ikeja')).body.data
        .ownership.status,
    ).toBe('unclaimed');
  });

  it('rejects a business email that is not on the business domain', async () => {
    const res = await consumer.post(`/businesses/${ids.gadget}/claims`, {
      method: 'business_email',
      claimantRole: 'Manager',
      verificationTarget: 'someone@gmail.com',
    });
    expect(res.status).toBe(400);
  });

  it('verifies control through an email on the business website domain', async () => {
    const salonOwner = await newVerifiedUser('salon_owner');
    const salon = await businessId('crown-and-coils-salon');
    const claim = await salonOwner.post(`/businesses/${salon}/claims`, {
      method: 'BUSINESS_EMAIL',
      claimantRole: 'Manager',
      verificationTarget: 'manager@crownandcoils.ng',
    });
    expect(claim.status).toBe(201);
    expect(claim.body.data.verified).toBe(false);
    const claimId = claim.body.data.id;
    // Staff cannot mark ownership "verified" before the proof is completed.
    expect(
      (
        await admin.post(`/admin/claims/${claimId}/approve`, {
          ownership: 'verified',
          note: 'Trying too early.',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await salonOwner.post(`/claims/${claimId}/verify-email`, {
          code: '000000',
        })
      ).status,
    ).toBe(400);
    const ok = await salonOwner.post(`/claims/${claimId}/verify-email`, {
      code: claim.body.data.devCode,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.verified).toBe(true);
    const approved = await admin.post(`/admin/claims/${claimId}/approve`, {
      ownership: 'verified',
      note: 'Code confirmed at manager@crownandcoils.ng (website domain).',
    });
    expect(approved.status).toBe(200);
    expect(
      (await new Client().get('/businesses/crown-and-coils-salon')).body.data
        .ownership.status,
    ).toBe('ownership_verified');
  });

  it('limits claim review to staff with CLAIMS_REVIEW', async () => {
    expect((await moderator.get('/admin/claims')).status).toBe(403);
    expect((await consumer.get('/admin/claims')).status).toBe(403);
    const list = await admin.get('/admin/claims');
    expect(list.body.data.map((c: { id: string }) => c.id)).toContain(
      ids.claim,
    );
  });

  it('approves the claim, granting the dashboard and the verified badge', async () => {
    const res = await admin.post(`/admin/claims/${ids.claim}/approve`, {
      ownership: 'verified',
      note: 'Called the shop line and checked the CAC certificate in person.',
    });
    expect(res.status).toBe(200);
    const mine = await ownerCandidate.get('/users/me/businesses');
    expect(mine.body.data[0].business.slug).toBe('gadget-hub-ikeja');
    const pub = (await new Client().get('/businesses/gadget-hub-ikeja')).body
      .data;
    expect(pub.ownership.label).toBe('Ownership verified');
    expect(pub.ownership.description).toMatch(/not an endorsement/);
  });

  it('lets owners edit permitted fields only', async () => {
    const ok = await ownerCandidate.patch(`/manage/businesses/${ids.gadget}`, {
      description: 'Phones, laptops and repairs with warranty.',
    });
    expect(ok.status).toBe(200);
    expect(
      (
        await ownerCandidate.patch(`/manage/businesses/${ids.gadget}`, {
          name: 'Best Gadgets Ever',
        })
      ).status,
    ).toBe(400);
    expect(
      (await consumer.get(`/manage/businesses/${ids.gadget}/dashboard`)).status,
    ).toBe(403);
  });

  it('shows an actionable dashboard', async () => {
    const d = (
      await ownerCandidate.get(`/manage/businesses/${ids.gadget}/dashboard`)
    ).body.data;
    expect(d.overview.rating.reviewCount).toBe(6);
    expect(d.responseActivity.responded).toBe(0);
    expect(d.unresolvedComplaints.count).toBeGreaterThanOrEqual(2);
    expect(d.trends.monthly).toHaveLength(6);
    expect(d.shareLinks.reviewUrl).toBe(
      'http://localhost:3000/businesses/gadget-hub-ikeja/review',
    );
    expect(d.shareLinks.policy).toMatch(/never offer rewards/);
  });

  it('posts one official response per review, clearly attributed', async () => {
    const url = `/manage/businesses/${ids.gadget}/reviews/${ids.review}/response`;
    const r = await ownerCandidate.post(url, {
      body: 'Sorry about the charging port. We now test every port before sale.',
    });
    expect(r.status).toBe(201);
    expect(
      (
        await ownerCandidate.post(url, {
          body: 'A second official response should not be allowed.',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await consumer2.post(url, {
          body: 'I am not the owner and should not be able to respond.',
        })
      ).status,
    ).toBe(403);
    const edit = await ownerCandidate.patch(url, {
      body: 'Sorry about the charging port. We now test every port before every sale.',
    });
    expect(edit.body.data.editsRemaining).toBe(2);
    const review = (await new Client().get(`/reviews/${ids.review}`)).body.data;
    expect(review.response.label).toBe(
      'Official response from Gadget Hub Ikeja',
    );
    expect(review.resolution.status).toBe('business_responded');
  });

  it('lets only the consumer report a complaint resolved, without touching the rating', async () => {
    const before = (
      await prisma.business.findUniqueOrThrow({ where: { id: ids.gadget } })
    ).ratingAverage;
    const propose = await ownerCandidate.post(
      `/manage/businesses/${ids.gadget}/reviews/${ids.review}/resolution`,
      {
        note: 'We replaced the phone on 15 November.',
      },
    );
    expect(propose.body.data.status).toBe('resolution_proposed');
    expect(
      (
        await ownerCandidate.post(`/reviews/${ids.review}/resolution`, {
          status: 'resolved',
        })
      ).status,
    ).toBe(403);
    const done = await consumer.post(`/reviews/${ids.review}/resolution`, {
      status: 'resolved',
      note: 'Replacement works.',
    });
    expect(done.body.data.status).toBe('resolved_by_consumer');
    const history = (await new Client().get(`/reviews/${ids.review}`)).body.data
      .resolutionHistory;
    expect(history.map((h: { status: string }) => h.status)).toEqual([
      'business_responded',
      'resolution_proposed',
      'resolved_by_consumer',
    ]);
    const after = (
      await prisma.business.findUniqueOrThrow({ where: { id: ids.gadget } })
    ).ratingAverage;
    expect(after).toBe(before);
  });

  it('blocks conflicts of interest', async () => {
    const own = await ownerCandidate.post('/reviews', {
      businessId: ids.gadget,
      overallRating: 5,
      dimensions: [
        { key: 'product_service_quality', score: 5 },
        { key: 'customer_service', score: 5 },
        { key: 'value_for_money', score: 5 },
      ],
      body: 'Owners must never be able to review their own business on TalkGround.',
    });
    expect(own.status).toBe(403);
    const reviews = (
      await new Client().get('/businesses/gadget-hub-ikeja/reviews')
    ).body.data;
    const someone = reviews.find((r: { id: string }) => r.id !== ids.review);
    expect(
      (
        await ownerCandidate.put(`/reviews/${someone.id}/vote`, {
          helpful: true,
        })
      ).status,
    ).toBe(403);
  });
});

describe('AC10, AC16, AC17, AC20: reports, disputes, moderation, restrictions and audit', () => {
  it('queues reports without hiding the review', async () => {
    const rep = await consumer2.post(`/reviews/${ids.review}/reports`, {
      reason: 'false_experience',
      details: 'Looks invented.',
    });
    expect(rep.status).toBe(201);
    ids.report = rep.body.data.id;
    expect(
      (
        await consumer2.post(`/reviews/${ids.review}/reports`, {
          reason: 'spam_promotional',
        })
      ).status,
    ).toBe(409);
    expect((await new Client().get(`/reviews/${ids.review}`)).status).toBe(200);
    const queue = await moderator.get('/admin/reviews?queue=reported');
    expect(queue.body.data.map((r: { id: string }) => r.id)).toContain(
      ids.review,
    );
    const decided = await moderator.patch(`/admin/reports/${ids.report}`, {
      decision: 'dismiss',
      reason: 'no_violation',
      note: 'Receipt-backed experience.',
    });
    expect(decided.status).toBe(200);
  });

  it('runs a business dispute without letting the business delete the review', async () => {
    const url = `/manage/businesses/${ids.gadget}/reviews/${ids.review}/disputes`;
    const d = await ownerCandidate.post(url, {
      reason: 'false_experience',
      details:
        'We have no record of this order on the date given; please check the reviewer evidence.',
    });
    expect(d.status).toBe(201);
    expect(
      (
        await ownerCandidate.post(url, {
          reason: 'false_experience',
          details: 'Opening a second dispute on the same review must fail.',
        })
      ).status,
    ).toBe(409);
    const rejected = await moderator.patch(
      `/admin/disputes/${d.body.data.id}`,
      {
        decision: 'reject',
        reason: 'no_violation',
        note: 'The reviewer described a real repair; no rule broken.',
      },
    );
    expect(rejected.status).toBe(200);
    expect(
      (await new Client().get(`/reviews/${ids.review}`)).body.data.status,
    ).toBe('published');
    const issues = (
      await ownerCandidate.get(`/manage/businesses/${ids.gadget}/issues`)
    ).body.data;
    expect(issues.disputes[0].status).toBe('rejected');
  });

  it('requires a policy ground to remove, and labels investigations publicly', async () => {
    expect(
      (
        await moderator.post(`/admin/reviews/${ids.review}/moderation`, {
          action: 'remove',
          reason: 'no_violation',
        })
      ).status,
    ).toBe(400);
    const inv = await moderator.post(
      `/admin/reviews/${ids.review}/moderation`,
      { action: 'investigate', reason: 'fabricated_review', note: 'Checking.' },
    );
    expect(inv.status).toBe(200);
    const pub = (await new Client().get(`/reviews/${ids.review}`)).body.data;
    expect(pub.labels.map((l: { key: string }) => l.key)).toContain(
      'under_investigation',
    );
    expect(
      (
        await moderator.post(`/admin/reviews/${ids.review}/moderation`, {
          action: 'clear_investigation',
          reason: 'no_violation',
        })
      ).status,
    ).toBe(200);
  });

  it('restricts abusive accounts immediately', async () => {
    const victim = await newVerifiedUser('spam_account');
    const me = (await victim.get('/users/me')).body.data;
    const s = await admin.patch(`/admin/users/${me.id}/suspension`, {
      suspended: true,
      reason: 'Spam reviews',
    });
    expect(s.status).toBe(200);
    expect((await victim.get('/users/me')).status).toBe(401);
  });

  it('enforces staff permissions', async () => {
    expect((await consumer.get('/admin/dashboard')).status).toBe(403);
    expect((await moderator.get('/admin/dashboard')).status).toBe(200);
    expect((await moderator.get('/admin/audit-logs')).status).toBe(403);
    expect((await moderator.get('/admin/businesses')).status).toBe(403);
  });

  it('records sensitive actions in the audit log (actor, action, target, time)', async () => {
    for (const action of [
      'claim.approve',
      'business.merge',
      'user.suspend',
      'submission.approve',
      'moderation.review',
    ]) {
      const res = await admin.get(`/admin/audit-logs?action=${action}`);
      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBeGreaterThan(0);
      const row = res.body.data[0];
      expect(row.actorId).toBeTruthy();
      expect(row.targetId).toBeTruthy();
      expect(row.createdAt).toBeTruthy();
    }
  });
});

describe('AC1, AC19: data rights', () => {
  it('exports and deletes an account, withdrawing its reviews', async () => {
    const exp = await consumer.get('/users/me/export');
    expect(exp.status).toBe(200);
    expect(exp.body.data.reviews.length).toBeGreaterThan(0);
    expect(
      (await consumer.delete('/users/me', { password: 'wrong-password' }))
        .status,
    ).toBe(401);
    const del = await consumer.delete('/users/me', { password: 'Secret123!' });
    expect(del.status).toBe(200);
    const relogin = await new Client().post('/auth/login', {
      email: 'e2e_consumer@example.com',
      password: 'Secret123!',
    });
    expect(relogin.status).toBe(401);
    const gadget = await prisma.business.findUniqueOrThrow({
      where: { id: ids.gadget },
    });
    expect(gadget.reviewCount).toBe(5);
  });
});
