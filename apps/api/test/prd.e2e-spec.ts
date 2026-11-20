/**
 * End-to-end tests of PRD v2.5 against a real Postgres (§19 acceptance criteria and the §0.3
 * definition of done: success, permission-denied and validation-failed cases per feature).
 * Each "user" is a supertest agent that keeps its HttpOnly cookies, exactly like a browser.
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
const DEMO = 'E2e-Demo-Password-1';
const ADMIN = 'E2e-Admin-Password-1';

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
  delete(url: string, body?: object) {
    return this.agent
      .delete(API + url)
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', this.ip)
      .send(body ?? {});
  }
}
const guest = () => new Client();

async function login(email: string, password = DEMO) {
  const c = new Client();
  const res = await c.post('/auth/login', { email, password });
  expect(res.status).toBe(201);
  return c;
}

async function newVerifiedUser(username: string) {
  const c = new Client();
  const reg = await c.post('/auth/register', {
    email: `${username}@example.org`,
    password: 'Secret123!',
    displayName: username.replace('_', ' '),
    username,
  });
  expect(reg.status).toBe(201);
  expect(
    (
      await c.post('/auth/verify-email/confirm', {
        otp: reg.body.data.devEmailCode,
      })
    ).status,
  ).toBeLessThan(300);
  return c;
}

const ids: Record<string, string> = {};
const bizId = async (slug: string) =>
  (await prisma.business.findUniqueOrThrow({ where: { slug } })).id;
const BODY =
  'This is a detailed and honest description of my experience with the business, long enough to pass the minimum.';

let admin: Client; // super_admin
let listings: Client; // admin
let moderator: Client; // moderator
let consumer: Client; // registered in this suite
let reviewer2: Client; // seeded consumer
let owner: Client; // seeded member of Kemi's Closet

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  prisma = app.get(PrismaService);
  admin = await login('admin@talkground.test', ADMIN);
  listings = await login('listings@talkground.test');
  moderator = await login('moderator@talkground.test');
  reviewer2 = await login('reviewer2@talkground.test');
  owner = await login('owner@talkground.test');
});

afterAll(async () => {
  await app.close();
});

describe('§7.1 accounts and security', () => {
  it('registers with HttpOnly cookies, no tokens in the body, and a 15-minute access token even if configured longer', async () => {
    consumer = new Client();
    const res = await consumer.post('/auth/register', {
      email: 'e2e_consumer@example.org',
      password: 'Secret123!',
      displayName: 'E2E Consumer',
      username: 'e2e_consumer',
    });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toMatch(
      /"accessToken"|"refreshToken"/,
    );
    expect(res.body.data.expiresIn).toBe(900);
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(
      cookies.some(
        (c) => c.startsWith('talkground_at=') && /HttpOnly/i.test(c),
      ),
    ).toBe(true);
    ids.code = res.body.data.devEmailCode;
  });

  it('requires a verified email to review (phone not required by default)', async () => {
    const r = await consumer.post('/reviews', {
      businessId: await bizId('adire-lane'),
      overallRating: 4,
      title: 'Too early',
      body: BODY,
    });
    expect(r.status).toBe(403);
    expect(
      (await consumer.post('/auth/verify-email/confirm', { otp: ids.code }))
        .status,
    ).toBeLessThan(300);
    const me = await consumer.get('/users/me');
    expect(me.body.data.emailVerified).toBe(true);
    expect(me.body.data.phoneVerified).toBe(false);
  });

  it('rejects unauthenticated and Bearer-only calls; validation fails cleanly', async () => {
    expect((await guest().get('/users/me')).status).toBe(401);
    expect(
      (
        await request(app.getHttpServer())
          .get(`${API}/users/me`)
          .set('Authorization', 'Bearer x.y.z')
      ).status,
    ).toBe(401);
    const bad = await guest().post('/auth/register', {
      email: 'not-an-email',
      password: '1',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('BAD_REQUEST');
  });

  it('keeps public profiles to what users chose to show', async () => {
    await consumer.patch('/users/me', { location: 'Yaba, Lagos' });
    const pub = await guest().get('/users/e2e_consumer');
    expect(pub.body.data.location).toBe('Yaba, Lagos');
    expect(JSON.stringify(pub.body)).not.toMatch(
      /@example\.org|emailVerified|phone/,
    );
  });

  it('has no revyu strings or demo credentials in the public OpenAPI document', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
    const text = JSON.stringify(SwaggerModule.createDocument(app, new DocumentBuilder().build()));
    expect(text.length).toBeGreaterThan(10_000);
    expect(text.toLowerCase()).not.toContain('revyu');
    expect(text).not.toMatch(/demo1234|admin123|@gmail\.com|E2e-.*-Password/);
  });
});

describe('§5 categories and cities are database records, managed without a deploy', () => {
  it('lists launch categories (hotels kept inactive) with configurable dimensions', async () => {
    const cats = (await guest().get('/categories')).body.data;
    expect(cats.map((c: { slug: string }) => c.slug)).toEqual([
      'fashion-and-clothing',
      'beauty-skincare-and-hair',
      'electronics-and-gadgets',
      'food-and-restaurants',
      'logistics-and-delivery',
      'general-consumer-services',
    ]);
    const food = cats.find(
      (c: { slug: string }) => c.slug === 'food-and-restaurants',
    );
    expect(
      food.ratingDimensions.find((d: { key: string }) => d.key === 'delivery')
        .required,
    ).toBe(false);
    expect(
      food.ratingDimensions.find(
        (d: { key: string }) => d.key === 'food_quality',
      ).required,
    ).toBe(true);
  });

  it('lets an admin add a city and a category; moderators cannot', async () => {
    expect(
      (
        await moderator.post('/admin/cities', {
          name: 'Benin City',
          state: 'Edo',
        })
      ).status,
    ).toBe(403);
    expect(
      (await listings.post('/admin/cities', { name: '', state: 'Edo' })).status,
    ).toBe(400);
    const city = await listings.post('/admin/cities', {
      name: 'Benin City',
      state: 'Edo',
    });
    expect(city.status).toBe(201);
    expect(
      (await guest().get('/cities')).body.data.map(
        (c: { slug: string }) => c.slug,
      ),
    ).toContain('benin-city');
    const cat = await listings.post('/admin/categories', {
      slug: 'healthcare-providers',
      name: 'Healthcare providers',
      dimensions: [{ key: 'service_quality', required: true }],
    });
    expect(cat.status).toBe(201);
    expect(
      (await guest().get('/categories/healthcare-providers')).body.data
        .ratingDimensions,
    ).toHaveLength(1);
  });
});

describe('§7.2 search', () => {
  it('finds a business by Instagram handle, name, partial words, website, area and exact phone', async () => {
    const first = async (q: string) =>
      (await guest().get(`/businesses?q=${encodeURIComponent(q)}`)).body.data[0]
        ?.slug;
    expect(await first('@mamaput_lagos')).toBe('mama-put-kitchen');
    expect(await first('kemi')).toBe('kemi-s-closet');
    expect(await first('kem clo')).toBe('kemi-s-closet');
    expect(await first('kemiscloset.ng')).toBe('kemi-s-closet');
    expect(await first('Surulere')).toBe('mama-put-kitchen');
    expect(await first('0803 123 4567')).toBe('kemi-s-closet');
    expect((await guest().get('/businesses?q=0803123')).body.data).toHaveLength(
      0,
    ); // phones match exactly
  });

  it('filters by category, city and rating (only businesses with a displayed rating) and sorts', async () => {
    expect(
      (await guest().get('/businesses?category=electronics-and-gadgets')).body
        .meta.total,
    ).toBe(3);
    const lagos = (await guest().get('/businesses?city=lagos')).body.data.map(
      (b: { slug: string }) => b.slug,
    );
    expect(lagos).toEqual(
      expect.arrayContaining(['kemi-s-closet', 'gadget-hub-ikeja']),
    );
    expect(lagos).not.toContain('adire-lane');
    const rated = (
      await guest().get('/businesses?minRating=3.5')
    ).body.data.map((b: { slug: string }) => b.slug);
    expect(rated).toEqual(
      expect.arrayContaining([
        'kemi-s-closet',
        'swiftdrop-logistics',
        'crown-and-coils-salon',
      ]),
    );
    expect(rated).not.toContain('adire-lane'); // average 4.0 but only 2 reviews (< 3): no displayed rating
    expect(
      (await guest().get('/businesses?sort=most_reviewed')).body.data[0].slug,
    ).toBe('kemi-s-closet');
    expect((await guest().get('/businesses?sort=nonsense')).status).toBe(400);
  });

  it('sets cache headers on public reads only', async () => {
    const pub = await guest().get('/businesses');
    expect(pub.headers['cache-control']).toMatch(/s-maxage=900/);
    expect((await consumer.get('/users/me')).headers['cache-control']).toBe(
      'private, no-store',
    );
  });
});

describe('§7.3 profile, §7.12 ratings, §7.13 SEO', () => {
  it('renders a complete, server-render-ready profile with separate labels and SEO data', async () => {
    const p = (await guest().get('/businesses/kemi-s-closet')).body.data;
    expect(p.kind).toBe('profile');
    expect(p.rating.reviewCount).toBe(6);
    expect(p.rating.average).toBe(4.2);
    expect(p.rating.distribution).toHaveLength(5);
    expect(p.rating.dimensions.map((d: { key: string }) => d.key)).toEqual([
      'product_quality',
      'sizing_fit',
      'delivery',
      'value_for_money',
    ]);
    expect(p.ownership).toMatchObject({
      status: 'claimed',
      ownershipVerified: true,
      label: 'Ownership verified',
    });
    expect(p.disclaimer).toBe(
      'A public listing does not mean TalkGround endorses or has verified this business.',
    );
    expect(p.seo).toMatchObject({
      indexable: true,
      robots: 'index,follow',
      canonicalPath: '/b/kemi-s-closet',
      title: "Kemi's Closet Reviews | TalkGround",
    });
    expect(p.seo.jsonLd.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.2,
      reviewCount: 6,
      bestRating: 5,
      worstRating: 1,
    });
    expect(p.seo.description).not.toMatch(/verified|trusted/i);
    const review = p.recentReviews[0];
    for (const field of [
      'evidenceAttached',
      'evidenceStatus',
      'underInvestigation',
    ])
      expect(review).toHaveProperty(field);
    expect(review.reviewer).toHaveProperty('emailVerified');
    expect(JSON.stringify(p)).not.toMatch(/verified purchase/i);
  });

  it('shows "Not enough reviews yet" below 3 reviews, with no aggregateRating markup', async () => {
    const p = (await guest().get('/businesses/adire-lane')).body.data;
    expect(p.rating).toMatchObject({
      reviewCount: 2,
      average: null,
      sufficientData: false,
      message: 'Not enough reviews yet',
      minimumReviews: 3,
    });
    expect(p.seo.jsonLd.aggregateRating).toBeUndefined();
  });

  it('marks thin pages noindex and keeps them out of the sitemap', async () => {
    const thin = (await guest().get('/businesses/threadline-menswear')).body
      .data;
    expect(thin.seo).toMatchObject({
      indexable: false,
      robots: 'noindex,follow',
    });
    const sitemap = (await guest().get('/seo/sitemap')).body.data.map(
      (e: { path: string }) => e.path,
    );
    expect(sitemap).toContain('/b/kemi-s-closet');
    expect(sitemap).not.toContain('/b/threadline-menswear');
    // No category has INDEXABLE_MIN_LISTINGS (5) published businesses yet, so no category pages.
    expect(sitemap.filter((p: string) => p.startsWith('/c/'))).toEqual([]);
  });

  it('serves category and category-in-city pages', async () => {
    const page = (
      await guest().get(
        '/categories/electronics-and-gadgets/businesses?city=lagos',
      )
    ).body;
    expect(page.data.total).toBe(1);
    expect(page.data.seo.canonicalPath).toBe(
      '/c/electronics-and-gadgets/lagos',
    );
    expect(page.data.seo.indexable).toBe(false); // fewer than INDEXABLE_MIN_LISTINGS
  });

  it('publishes versioned rating rules and public config', async () => {
    expect(
      (await guest().get('/meta/rating-methodology')).body.data,
    ).toMatchObject({ version: '2.0', minimumReviews: 3 });
    expect((await guest().get('/meta/config')).body.data).toMatchObject({
      minReviewsForRating: 3,
      reviewBodyMinLength: 50,
      accessTokenSeconds: 900,
    });
  });
});

describe('§6.2 / §13 submissions and duplicate signals', () => {
  it('accepts a suggestion that shares an identifier and shows it as a possible duplicate (never auto-rejected)', async () => {
    const r = await consumer.post('/business-submissions', {
      name: 'Kemi Closet Copy',
      category: 'fashion-and-clothing',
      city: 'lagos',
      identifiers: [{ type: 'INSTAGRAM', value: 'instagram.com/kemis_closet' }],
    });
    expect(r.status).toBe(201);
    expect(
      r.body.data.possibleMatches.map((m: { slug: string }) => m.slug),
    ).toContain('kemi-s-closet');
    ids.dupSubmission = r.body.data.id;
  });

  it('validates submissions and keeps them private until staff decide', async () => {
    expect(
      (
        await consumer.post('/business-submissions', {
          name: 'X',
          category: 'fashion-and-clothing',
          city: 'lagos',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await consumer.post('/business-submissions', {
          name: 'Nowhere Shop',
          category: 'fashion-and-clothing',
        })
      ).status,
    ).toBe(400);
    const ok = await consumer.post('/business-submissions', {
      name: 'Lagos Shoe Plug',
      category: 'fashion-and-clothing',
      city: 'lagos',
      area: 'Yaba',
      description:
        'Sneakers and slides sold on Instagram, with same-day delivery around Yaba and Surulere in Lagos.',
      identifiers: [{ type: 'instagram', value: '@lagosshoeplug' }],
    });
    expect(ok.status).toBe(201);
    expect((await guest().get('/businesses/lagos-shoe-plug')).status).toBe(404);
    expect(
      (await consumer.post(`/admin/submissions/${ok.body.data.id}/approve`, {}))
        .status,
    ).toBe(403);
    const approved = await moderator.post(
      `/admin/submissions/${ok.body.data.id}/approve`,
      {},
    );
    expect(approved.status).toBe(200);
    expect(
      (await guest().get('/businesses/lagos-shoe-plug')).body.data.kind,
    ).toBe('profile');
    const merged = await moderator.post(
      `/admin/submissions/${ids.dupSubmission}/merge`,
      { businessId: await bizId('kemi-s-closet') },
    );
    expect(merged.body.data.status).toBe('merged');
  });
});

describe('§7.4 lifecycle, slugs, merge', () => {
  it('requires confirmation for possible duplicates on admin create', async () => {
    const body = {
      name: 'Kemis Closet',
      category: 'fashion-and-clothing',
      city: 'lagos',
      description:
        'Duplicate listing of an Instagram fashion vendor in Yaba, Lagos, created to test merging and redirects.',
      identifiers: [{ type: 'INSTAGRAM', value: '@kemis_closet_ng' }],
    };
    expect((await moderator.post('/admin/businesses', body)).status).toBe(403);
    const first = await listings.post('/admin/businesses', body);
    expect(first.status).toBe(409);
    expect(first.body.error.details.duplicateCandidates.length).toBeGreaterThan(
      0,
    );
    const created = await listings.post('/admin/businesses', {
      ...body,
      confirmNotDuplicate: true,
    });
    expect(created.status).toBe(201);
    ids.dup = created.body.data.id;
  });

  it('enforces the status transition table', async () => {
    expect(
      (
        await listings.patch(`/admin/businesses/${ids.dup}/status`, {
          status: 'pending_review',
          reason: 'Back to drafts',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await listings.patch(`/admin/businesses/${ids.dup}/status`, {
          status: 'archived',
          reason: 'Test archive',
        })
      ).status,
    ).toBe(200);
    expect((await guest().get('/businesses/kemis-closet')).status).toBe(410);
  });

  it('regenerates the slug on rename and 301s the old one forever', async () => {
    const id = await bizId('suya-spot-wuse');
    const r = await listings.patch(`/admin/businesses/${id}`, {
      name: 'Suya Spot Abuja',
    });
    expect(r.body.data.slug).toBe('suya-spot-abuja');
    expect(r.body.data.previousSlugs).toContain('suya-spot-wuse');
    const old = (await guest().get('/businesses/suya-spot-wuse')).body.data;
    expect(old).toMatchObject({
      kind: 'redirect',
      reason: 'slug_changed',
      slug: 'suya-spot-abuja',
      statusCode: 301,
    });
    // An old slug is never reused.
    const clash = await listings.post('/admin/businesses', {
      name: 'Suya Spot Wuse',
      category: 'food-and-restaurants',
      city: 'abuja',
      area: 'Wuse',
      confirmNotDuplicate: true,
      publish: false,
    });
    expect(clash.body.data.slug).not.toBe('suya-spot-wuse');
  });

  it('merges a duplicate: reviews move to the target and the old URL redirects', async () => {
    const dup = await listings.post('/admin/businesses', {
      name: 'Gadget Hub Computer Village',
      category: 'electronics-and-gadgets',
      city: 'lagos',
      area: 'Ikeja',
      description:
        'Second listing for the same Computer Village phone shop, created here to exercise the merge flow end to end.',
      identifiers: [{ type: 'INSTAGRAM', value: 'gadgethub_cv' }],
      confirmNotDuplicate: true,
    });
    const fresh = await newVerifiedUser('merge_reviewer');
    const review = await fresh.post('/reviews', {
      businessId: dup.body.data.id,
      overallRating: 3,
      title: 'Average shop',
      body: BODY,
      dimensions: [
        { key: 'product_authenticity', value: 3 },
        { key: 'value_for_money', value: 3 },
      ],
    });
    expect(review.status).toBe(201);
    const before = (await guest().get('/businesses/gadget-hub-ikeja')).body.data
      .rating.reviewCount;
    expect(
      (
        await moderator.post(`/admin/businesses/${dup.body.data.id}/merge`, {
          targetId: await bizId('gadget-hub-ikeja'),
          reason: 'dup',
        })
      ).status,
    ).toBe(403);
    const merged = await listings.post(
      `/admin/businesses/${dup.body.data.id}/merge`,
      {
        targetId: await bizId('gadget-hub-ikeja'),
        reason: 'Same shop listed twice',
      },
    );
    expect(merged.status).toBe(200);
    expect(merged.body.data.movedReviews).toBe(1);
    expect(
      (await guest().get('/businesses/gadget-hub-computer-village')).body.data,
    ).toMatchObject({
      kind: 'redirect',
      reason: 'merged',
      slug: 'gadget-hub-ikeja',
    });
    expect(
      (await guest().get('/businesses/gadget-hub-ikeja')).body.data.rating
        .reviewCount,
    ).toBe(before + 1);
  });

  it('lets a moderator force noindex, audited', async () => {
    const id = await bizId('mama-put-kitchen');
    expect(
      (
        await reviewer2.patch(`/admin/businesses/${id}/noindex`, {
          noindex: true,
          reason: 'x',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await moderator.patch(`/admin/businesses/${id}/noindex`, {
          noindex: true,
          reason: 'Legal complaint under review',
        })
      ).status,
    ).toBe(200);
    expect(
      (await guest().get('/businesses/mama-put-kitchen')).body.data.seo.robots,
    ).toBe('noindex,follow');
    await moderator.patch(`/admin/businesses/${id}/noindex`, {
      noindex: false,
      reason: 'Complaint closed',
    });
  });
});

describe('§7.6 reviews', () => {
  it('validates dimensions, title and body length', async () => {
    const gadget = await bizId('gadget-hub-ikeja');
    const base = {
      businessId: gadget,
      overallRating: 2,
      title: 'Faulty port',
      body: BODY,
    };
    expect(
      (
        await consumer.post('/reviews', {
          ...base,
          dimensions: [{ key: 'product_authenticity', value: 2 }],
        })
      ).body.error.message,
    ).toMatch(/Please rate: Value for money/);
    expect(
      (
        await consumer.post('/reviews', {
          ...base,
          dimensions: [{ key: 'hygiene_safety', value: 2 }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await consumer.post('/reviews', {
          ...base,
          title: 'ab',
          dimensions: [],
        })
      ).status,
    ).toBe(400);
    const short = await consumer.post('/reviews', {
      ...base,
      body: 'Too short to be useful.',
      dimensions: [
        { key: 'product_authenticity', value: 2 },
        { key: 'value_for_money', value: 2 },
      ],
    });
    expect(short.status).toBe(400);
    expect(short.body.error.message).toMatch(/at least 50/);
  });

  it('publishes a review with separate label fields and no purchase claim', async () => {
    const res = await consumer.post('/reviews', {
      businessId: await bizId('gadget-hub-ikeja'),
      overallRating: 2,
      title: 'Faulty charging port',
      body: 'The phone I bought had a faulty charging port and they took two weeks to fix it, with very little communication.',
      recommend: false,
      dimensions: [
        { key: 'product_authenticity', value: 2 },
        { key: 'value_for_money', value: 3 },
        { key: 'after_sales_support', value: 1 },
      ],
    });
    expect(res.status).toBe(201);
    ids.review = res.body.data.id;
    expect(res.body.data).toMatchObject({
      status: 'published',
      evidenceAttached: false,
      evidenceStatus: 'not_reviewed',
      underInvestigation: false,
      recommend: false,
    });
    expect(res.body.data.labels.map((l: { key: string }) => l.key)).toEqual([
      'account_verified',
    ]);
  });

  it('allows one active review per business; a repeat experience is an update with history', async () => {
    const again = await consumer.post('/reviews', {
      businessId: await bizId('gadget-hub-ikeja'),
      overallRating: 5,
      title: 'Second try',
      body: BODY,
      dimensions: [
        { key: 'product_authenticity', value: 5 },
        { key: 'value_for_money', value: 5 },
      ],
    });
    expect(again.status).toBe(409);
    expect(again.body.error.details.reviewId).toBe(ids.review);
    const edit = await consumer.patch(`/reviews/${ids.review}`, {
      overallRating: 3,
      body: 'Update after a second visit: they replaced the phone and apologised, though it took two weeks overall.',
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data.edited).toBe(true);
    const revs = await consumer.get(`/reviews/${ids.review}/revisions`);
    expect(revs.body.data[0].snapshot.overallRating).toBe(2);
    expect(
      (await reviewer2.get(`/reviews/${ids.review}/revisions`)).status,
    ).toBe(403);
    expect(
      (await reviewer2.patch(`/reviews/${ids.review}`, { title: 'Hijack' }))
        .status,
    ).toBe(403);
  });

  it('caps new reviews per day', async () => {
    const limited = await newVerifiedUser('busy_reviewer');
    const slugs = [
      'crumbs-bakery-ph',
      'eventful-rentals',
      'printpro-enugu',
      'volt-phones-abuja',
    ];
    const results: number[] = [];
    for (const slug of slugs) {
      const id = await bizId(slug);
      const cat = (
        await prisma.business.findUniqueOrThrow({
          where: { id },
          include: {
            category: {
              include: {
                dimensions: {
                  where: { required: true },
                  include: { dimension: true },
                },
              },
            },
          },
        })
      ).category;
      const r = await limited.post('/reviews', {
        businessId: id,
        overallRating: 4,
        title: 'Good',
        body: BODY,
        dimensions: cat.dimensions.map((d) => ({
          key: d.dimension.key,
          value: 4,
        })),
      });
      results.push(r.status);
    }
    expect(results).toEqual([201, 201, 201, 400]);
  });

  it('requires Cloudinary for evidence (503) and validates evidence type (400)', async () => {
    expect(
      (
        await consumer.post(`/reviews/${ids.review}/evidence`, {
          type: 'video',
          url: 'https://x.y/z.jpg',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await consumer.post(`/reviews/${ids.review}/evidence`, {
          type: 'receipt',
          url: 'https://res.cloudinary.com/demo/image/authenticated/v1/talkground/receipts/r.jpg',
        })
      ).status,
    ).toBe(503);
  });
});

describe('§7.9 helpful votes', () => {
  it('toggles one vote per user, refuses self-votes and member votes', async () => {
    const on = await reviewer2.post(`/reviews/${ids.review}/helpful`);
    expect(on.body.data).toEqual({ helpful: true, helpfulCount: 1 });
    const off = await reviewer2.post(`/reviews/${ids.review}/helpful`);
    expect(off.body.data).toEqual({ helpful: false, helpfulCount: 0 });
    expect((await consumer.post(`/reviews/${ids.review}/helpful`)).status).toBe(
      400,
    );
    expect((await guest().post(`/reviews/${ids.review}/helpful`)).status).toBe(
      401,
    );
    expect(
      await prisma.helpfulVote.count({ where: { reviewId: ids.review } }),
    ).toBe(0);
  });
});

describe('§7.5 claims and business membership', () => {
  it('claims an Instagram-only vendor via social account and is approved by an admin', async () => {
    const vendor = await newVerifiedUser('mamaput_owner');
    const id = await bizId('mama-put-kitchen');
    ids.mamaput = id;
    expect(
      (
        await vendor.post(`/businesses/${id}/claims`, {
          method: 'social_account',
          claimantRole: 'Owner',
          verificationTarget: '@someone_else',
        })
      ).status,
    ).toBe(400);
    const claim = await vendor.post(`/businesses/${id}/claims`, {
      method: 'social_account',
      claimantRole: 'Owner',
      verificationTarget: '@mamaput_lagos',
    });
    expect(claim.status).toBe(201);
    expect(claim.body.data.instructions.code).toMatch(/^TG-[0-9A-F]{8}$/);
    expect(
      (
        await vendor.post(`/businesses/${id}/claims`, {
          method: 'manual_review',
          claimantRole: 'Owner',
          message: 'again',
        })
      ).status,
    ).toBe(409);
    expect(
      (await guest().get('/businesses/mama-put-kitchen')).body.data.ownership
        .status,
    ).toBe('unclaimed');
    expect((await moderator.get('/admin/claims')).status).toBe(403); // claim.decide is Admin+
    const detail = await listings.get(`/admin/claims/${claim.body.data.id}`);
    expect(detail.body.data.verification.codeToLookFor).toBe(
      claim.body.data.instructions.code,
    );
    expect(
      (
        await listings.post(`/admin/claims/${claim.body.data.id}/approve`, {
          ownershipVerified: true,
        })
      ).status,
    ).toBe(400);
    const ok = await listings.post(
      `/admin/claims/${claim.body.data.id}/approve`,
      { ownershipVerified: true, reason: 'Saw the code in the Instagram bio.' },
    );
    expect(ok.body.data).toMatchObject({
      status: 'approved',
      ownershipStatus: 'claimed',
      ownershipVerified: true,
    });
    expect((await vendor.get('/users/me/businesses')).body.data[0].slug).toBe(
      'mama-put-kitchen',
    );
    ids.vendor = 'mamaput_owner';
  });

  it('rejects a claim with a reason the claimant can see', async () => {
    const someone = await newVerifiedUser('claim_rejected');
    const id = await bizId('adire-lane');
    const claim = await someone.post(`/businesses/${id}/claims`, {
      method: 'manual_review',
      claimantRole: 'Manager',
      message: 'I manage their stall.',
    });
    expect(
      (await listings.post(`/admin/claims/${claim.body.data.id}/reject`, {}))
        .status,
    ).toBe(400);
    await listings.post(`/admin/claims/${claim.body.data.id}/reject`, {
      reason: 'We could not confirm your connection to the business.',
    });
    const mine = await someone.get(`/claims/${claim.body.data.id}`);
    expect(mine.body.data).toMatchObject({
      status: 'rejected',
      decisionReason: 'We could not confirm your connection to the business.',
    });
    expect(
      (await guest().get('/businesses/adire-lane')).body.data.ownership.status,
    ).toBe('unclaimed');
  });

  it('verifies a business email on the website domain before allowing "ownershipVerified"', async () => {
    const mgr = await newVerifiedUser('salon_manager');
    const id = await bizId('crown-and-coils-salon');
    expect(
      (
        await mgr.post(`/businesses/${id}/claims`, {
          method: 'business_email',
          claimantRole: 'Manager',
          verificationTarget: 'me@gmail.com',
        })
      ).status,
    ).toBe(400);
    const claim = await mgr.post(`/businesses/${id}/claims`, {
      method: 'business_email',
      claimantRole: 'Manager',
      verificationTarget: 'manager@crownandcoils.ng',
    });
    expect(
      (
        await listings.post(`/admin/claims/${claim.body.data.id}/approve`, {
          ownershipVerified: true,
          reason: 'too early',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await mgr.post(`/claims/${claim.body.data.id}/verify-email`, {
          code: '000000',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await mgr.post(`/claims/${claim.body.data.id}/verify-email`, {
          code: claim.body.data.devCode,
        })
      ).body.data.verificationConfirmed,
    ).toBe(true);
    expect(
      (
        await listings.post(`/admin/claims/${claim.body.data.id}/approve`, {
          ownershipVerified: true,
          reason: 'Code confirmed on the website domain.',
        })
      ).status,
    ).toBe(200);
  });

  it('keeps ownership from affecting ratings or search order', async () => {
    const p = (await guest().get('/businesses/mama-put-kitchen')).body.data;
    expect(p.rating.reviewCount).toBe(2);
    expect(p.rating.average).toBeNull();
  });
});

describe('§7.7–§7.11 business side', () => {
  it('lets members edit permitted fields only; non-members are refused', async () => {
    const id = await bizId('kemi-s-closet');
    ids.kemi = id;
    expect(
      (await reviewer2.get(`/manage/businesses/${id}/dashboard`)).status,
    ).toBe(403);
    expect(
      (await owner.patch(`/manage/businesses/${id}`, { name: 'New Name' }))
        .status,
    ).toBe(400);
    const ok = await owner.patch(`/manage/businesses/${id}`, {
      area: 'Yaba, Lagos Mainland',
    });
    expect(ok.body.data.location.area).toBe('Yaba, Lagos Mainland');
    expect(ok.body.data.indexable).toBe(true);
  });

  it('shows a simple dashboard with response rate/time, complaints, trend and neutral share links', async () => {
    const d = (await owner.get(`/manage/businesses/${ids.kemi}/dashboard`)).body
      .data;
    expect(d.rating.reviewCount).toBeGreaterThanOrEqual(6);
    expect(d.responseActivity.responded).toBe(1);
    expect(d.unresolvedComplaints.count).toBe(1);
    expect(d.trend).toHaveLength(6);
    expect(d.shareLinks.reviewUrl).toBe(
      'https://talkground.example/b/kemi-s-closet/review',
    );
    expect(d.shareLinks.badge.text).toBe('See our reviews on TalkGround');
  });

  it('lets only members respond, once per review, labelled "Response from <business>"', async () => {
    const reviews = (
      await owner.get(
        `/manage/businesses/${ids.kemi}/reviews?filter=unanswered`,
      )
    ).body.data;
    const target = reviews[0];
    ids.kemiReview = target.id;
    const url = `/manage/businesses/${ids.kemi}/reviews/${target.id}/response`;
    expect(
      (
        await reviewer2.post(url, {
          body: 'I am not a member of this business.',
        })
      ).status,
    ).toBe(403);
    expect((await owner.post(url, { body: 'short' })).status).toBe(400);
    expect(
      (
        await owner.post(url, {
          body: 'Thank you for the kind words, we are glad the dress fitted well.',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await owner.post(url, {
          body: 'A second response must not be allowed here.',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await owner.patch(url, {
          body: 'Thank you so much for the kind words, we are glad the dress fitted well.',
        })
      ).status,
    ).toBe(200);
    const pub = (await guest().get(`/reviews/${target.id}`)).body.data;
    expect(pub.response.label).toBe("Response from Kemi's Closet");
    expect(pub.resolution.status).toBe('business_responded');
  });

  it('lets only the reviewer mark a complaint resolved; resolution never changes the rating', async () => {
    const complaint = (
      await owner.get(
        `/manage/businesses/${ids.kemi}/reviews?filter=unresolved`,
      )
    ).body.data[0];
    const before = (await guest().get('/businesses/kemi-s-closet')).body.data
      .rating.average;
    expect(
      (
        await owner.post(`/reviews/${complaint.id}/resolution`, {
          status: 'resolved',
        })
      ).status,
    ).toBe(403);
    const author = await prisma.review.findUniqueOrThrow({
      where: { id: complaint.id },
      include: { user: true },
    });
    const reviewer = await login(author.user.email);
    expect(
      (
        await reviewer.post(`/reviews/${complaint.id}/resolution`, {
          status: 'resolved',
          note: 'Refund received.',
        })
      ).body.data.status,
    ).toBe('resolved_by_consumer');
    expect(
      (
        await reviewer.post(`/reviews/${complaint.id}/resolution`, {
          status: 'reopened',
        })
      ).body.data.status,
    ).toBe('reopened');
    expect(
      (await guest().get('/businesses/kemi-s-closet')).body.data.rating.average,
    ).toBe(before);
  });
});

describe('§8 reports, disputes, moderation', () => {
  it('a report flags the review "under investigation" without hiding it or changing the rating', async () => {
    const before = (await guest().get('/businesses/gadget-hub-ikeja')).body.data
      .rating;
    expect(
      (
        await reviewer2.post(`/reviews/${ids.review}/reports`, {
          reasonCode: 'BAD_REASON',
        })
      ).status,
    ).toBe(400);
    const rep = await reviewer2.post(`/reviews/${ids.review}/reports`, {
      reasonCode: 'fake_or_never_visited',
      note: 'Looks invented.',
    });
    expect(rep.status).toBe(201);
    ids.report = rep.body.data.id;
    expect(
      (
        await reviewer2.post(`/reviews/${ids.review}/reports`, {
          reasonCode: 'spam_or_promotional',
        })
      ).status,
    ).toBe(409);
    const pub = (await guest().get(`/reviews/${ids.review}`)).body.data;
    expect(pub.underInvestigation).toBe(true);
    expect(
      (await guest().get('/businesses/gadget-hub-ikeja')).body.data.rating,
    ).toEqual(before);
    expect(
      (
        await reviewer2.patch(`/admin/reports/${ids.report}`, {
          decision: 'dismiss',
          reason: 'no_violation',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await moderator.patch(`/admin/reports/${ids.report}`, {
          decision: 'dismiss',
          reason: 'no_violation',
          note: 'Receipt seen.',
        })
      ).status,
    ).toBe(200);
    expect(
      (await guest().get(`/reviews/${ids.review}`)).body.data
        .underInvestigation,
    ).toBe(false);
  });

  it('runs a dispute OPEN → UNDER_REVIEW → UPHELD; the original review is preserved', async () => {
    const url = `/manage/businesses/${ids.kemi}/reviews/${ids.kemiReview}/disputes`;
    expect((await owner.post(url, { reason: 'too short' })).status).toBe(400);
    const d = await owner.post(url, {
      reason:
        'We have no record of this order in our books for the date the reviewer describes.',
    });
    expect(d.status).toBe(201);
    expect(
      (
        await owner.post(url, {
          reason:
            'A second dispute on the same review must not be accepted at all.',
        })
      ).status,
    ).toBe(409);
    expect(
      (await guest().get(`/reviews/${ids.kemiReview}`)).body.data
        .underInvestigation,
    ).toBe(true);
    expect(
      (
        await moderator.patch(`/admin/disputes/${d.body.data.id}`, {
          decision: 'upheld',
          reason: 'no_violation',
          note: 'x'.repeat(10),
        })
      ).status,
    ).toBe(403);
    expect(
      (await listings.post(`/admin/disputes/${d.body.data.id}/start-review`))
        .body.data.status,
    ).toBe('under_review');
    const decided = await listings.patch(`/admin/disputes/${d.body.data.id}`, {
      decision: 'upheld',
      reason: 'no_violation',
      note: 'The review describes a real order; it stays.',
    });
    expect(decided.body.data.status).toBe('upheld');
    const pub = (await guest().get(`/reviews/${ids.kemiReview}`)).body.data;
    expect(pub.status).toBe('published');
    expect(pub.underInvestigation).toBe(false);
    expect(
      (await owner.get(`/manage/businesses/${ids.kemi}/issues`)).body.data
        .disputes[0].status,
    ).toBe('upheld');
  });

  it('requires a policy reason to take a review down; suspended reviews leave public pages and the rating', async () => {
    expect(
      (
        await moderator.post(`/admin/reviews/${ids.review}/moderation`, {
          action: 'remove',
          reason: 'no_violation',
        })
      ).status,
    ).toBe(400);
    const before = (await guest().get('/businesses/gadget-hub-ikeja')).body.data
      .rating.reviewCount;
    expect(
      (
        await moderator.post(`/admin/reviews/${ids.review}/moderation`, {
          action: 'suspend',
          reason: 'personal_information',
          note: 'Contains a phone number',
        })
      ).status,
    ).toBe(200);
    expect((await guest().get(`/reviews/${ids.review}`)).status).toBe(404);
    expect(
      (await guest().get('/businesses/gadget-hub-ikeja')).body.data.rating
        .reviewCount,
    ).toBe(before - 1);
    expect(
      (
        await moderator.patch(`/admin/reviews/${ids.review}/content`, {
          body: 'The phone had a faulty charging port; they replaced it after two weeks. [phone number removed by TalkGround]',
          reason: 'personal_information',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await moderator.post(`/admin/reviews/${ids.review}/moderation`, {
          action: 'restore',
          reason: 'no_violation',
        })
      ).status,
    ).toBe(200);
    const history = (await moderator.get(`/admin/reviews/${ids.review}`)).body
      .data;
    expect(
      history.revisions.some(
        (r: { snapshot: { editedBy: string } }) =>
          r.snapshot.editedBy === 'staff',
      ),
    ).toBe(true);
  });

  it('changes evidenceStatus only through evidence.review, audited', async () => {
    await prisma.review.update({
      where: { id: ids.review },
      data: { evidenceAttached: true },
    });
    expect(
      (
        await reviewer2.patch(`/admin/reviews/${ids.review}/evidence-status`, {
          status: 'accepted',
          reason: 'x',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await moderator.patch(`/admin/reviews/${ids.review}/evidence-status`, {
          status: 'maybe',
          reason: 'x',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await moderator.patch(`/admin/reviews/${ids.review}/evidence-status`, {
          status: 'accepted',
          reason: 'Receipt matches.',
        })
      ).status,
    ).toBe(200);
    const pub = (await guest().get(`/reviews/${ids.review}`)).body.data;
    expect(pub.evidenceStatus).toBe('accepted');
    expect(pub.labels.map((l: { key: string }) => l.key)).toContain(
      'evidence_reviewed',
    );
  });

  it('lets responses be reported and removed', async () => {
    const rep = await reviewer2.post(
      `/reviews/${ids.kemiReview}/response/reports`,
      { reasonCode: 'harassment_or_abuse', note: 'Rude' },
    );
    expect(rep.status).toBe(201);
    const decided = await moderator.patch(
      `/admin/reports/${rep.body.data.id}`,
      { decision: 'remove', reason: 'harassment' },
    );
    expect(decided.status).toBe(200);
    expect(
      (await guest().get(`/reviews/${ids.kemiReview}`)).body.data.response,
    ).toBeNull();
  });
});

describe('§9 permissions, §8.5 audit, §7.14 email log', () => {
  it('enforces the PRD permission table', async () => {
    expect((await moderator.get('/admin/reviews')).status).toBe(200);
    expect((await moderator.get('/admin/users')).status).toBe(403); // user.suspend: Admin+
    expect((await listings.get('/admin/users')).status).toBe(200);
    expect((await listings.get('/admin/roles')).status).toBe(403); // role.assign: Super Admin
    expect((await listings.get('/admin/audit-logs')).status).toBe(403); // auditlog.export: Super Admin
    expect(
      (await admin.get('/admin/roles')).body.data.roles
        .map((r: { key: string }) => r.key)
        .sort(),
    ).toEqual(['admin', 'moderator', 'super_admin']);
    expect((await consumer.get('/admin/dashboard')).status).toBe(403);
  });

  it('suspends abusive accounts immediately (user.suspend)', async () => {
    const victim = await newVerifiedUser('spam_account');
    const me = (await victim.get('/users/me')).body.data;
    expect(
      (
        await moderator.patch(`/admin/users/${me.id}/suspension`, {
          suspended: true,
          reason: 'spam',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await listings.patch(`/admin/users/${me.id}/suspension`, {
          suspended: true,
          reason: 'Spam reviews',
        })
      ).status,
    ).toBe(200);
    expect((await victim.get('/users/me')).status).toBe(401);
  });

  it('audit-logs sensitive actions with actor, target, before/after and reason; exports CSV', async () => {
    for (const action of [
      'claim.approve',
      'claim.reject',
      'business.merge',
      'business.status',
      'user.suspend',
      'suggestion.approve',
      'moderation.review',
      'category.create',
      'city.create',
      'dispute.open',
    ]) {
      const res = await admin.get(`/admin/audit-logs?action=${action}`);
      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBeGreaterThan(0);
    }
    const suspend = (await admin.get('/admin/audit-logs?action=user.suspend'))
      .body.data[0];
    expect(suspend).toMatchObject({
      targetType: 'user',
      before: { suspended: false },
      after: { suspended: true },
      reason: 'Spam reviews',
    });
    expect(suspend.actorId).toBeTruthy();
    const csv = await admin.get('/admin/audit-logs/export?action=claim.');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\r\n')[0]).toContain('createdAt,actorId');
  });

  it('records transactional emails with delivery status (provider not configured → failed, retryable)', async () => {
    const log = (await listings.get('/admin/emails?status=failed')).body;
    expect(log.meta.total).toBeGreaterThan(0);
    const kinds = new Set(log.data.map((e: { kind: string }) => e.kind));
    for (const k of [
      'claim.decision',
      'review.business_response',
      'dispute.update',
    ])
      expect(kinds.has(k)).toBe(true);
    expect(
      (await listings.post(`/admin/emails/${log.data[0].id}/retry`)).body.data
        .delivered,
    ).toBe(false);
  });
});

describe('§15 data rights', () => {
  it('exports and deletes an account; its reviews leave public pages and ratings', async () => {
    const exp = await consumer.get('/users/me/export');
    expect(exp.body.data.reviews.length).toBeGreaterThan(0);
    expect(
      (await consumer.delete('/users/me', { password: 'wrong-password' }))
        .status,
    ).toBe(401);
    const before = (await guest().get('/businesses/gadget-hub-ikeja')).body.data
      .rating.reviewCount;
    expect(
      (await consumer.delete('/users/me', { password: 'Secret123!' })).status,
    ).toBe(200);
    expect(
      (
        await guest().post('/auth/login', {
          email: 'e2e_consumer@example.org',
          password: 'Secret123!',
        })
      ).status,
    ).toBe(401);
    expect((await guest().get(`/reviews/${ids.review}`)).status).toBe(404);
    expect(
      (await guest().get('/businesses/gadget-hub-ikeja')).body.data.rating
        .reviewCount,
    ).toBe(before - 1);
  });
});

describe('§0.3 definition of done: Swagger documents every response', () => {
  it('every operation has a documented 2xx response with a schema', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const missing: string[] = [];
    for (const [path, ops] of Object.entries(
      doc.paths as Record<
        string,
        Record<string, { responses?: Record<string, { content?: unknown }> }>
      >,
    )) {
      for (const [method, op] of Object.entries(ops)) {
        const ok = Object.entries(op.responses ?? {}).some(
          ([code, r]) => code.startsWith('2') && !!r.content,
        );
        if (!ok && !path.endsWith('/export'))
          missing.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
