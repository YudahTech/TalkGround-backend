/**
 * Demo data for development and frontend integration. Idempotent: safe to run repeatedly.
 * Businesses are fictional. Remove demo data before public launch (see docs).
 *
 * Accounts (password in brackets):
 *   admin@revyu.ng            super admin   (admin123)
 *   moderator@example.com     moderator     (demo1234)
 *   chinedu.okafor@gmail.com  consumer      (demo1234)
 *   owner@example.com         owns "Kemi's Closet" (demo1234)
 *   reviewer1..6@example.com  consumers     (demo1234)
 */
import {
  BusinessSource,
  BusinessStatus,
  IdentifierType,
  MemberRole,
  OwnershipStatus,
  PrismaClient,
  ResolutionStatus,
  ReviewStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { RatingsService } from '../src/businesses/ratings.service';
import { BusinessWriterService } from '../src/businesses/business-writer.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { slugify } from '../src/common/utils';

const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const ratings = new RatingsService(db);
const writer = new BusinessWriterService(db, ratings);

const DAY = 86_400_000;

type SeedBusiness = {
  name: string;
  category: string;
  description: string;
  state: string;
  city: string;
  area?: string;
  nationwide?: boolean;
  website?: string;
  identifiers: { type: IdentifierType; value: string }[];
  /** [rating, dims (score per category dimension in order), body] */
  reviews?: [number, number[], string][];
};

const BUSINESSES: SeedBusiness[] = [
  {
    name: "Kemi's Closet",
    category: 'fashion-clothing',
    description:
      'Ready-to-wear dresses and two-piece sets, sold on Instagram with delivery across Nigeria.',
    state: 'lagos',
    city: 'Lagos',
    area: 'Yaba',
    nationwide: true,
    website: 'https://kemiscloset.ng',
    identifiers: [
      { type: IdentifierType.INSTAGRAM, value: '@kemis_closet' },
      { type: IdentifierType.TIKTOK, value: '@kemiscloset' },
      { type: IdentifierType.WHATSAPP, value: '08031234567' },
      { type: IdentifierType.ALTERNATIVE_NAME, value: 'Kemi Closet NG' },
    ],
    reviews: [
      [
        5,
        [5, 4, 5, 5, 5],
        'Ordered two dresses for a wedding. The fabric was even better than the photos and they arrived in three days. The vendor replied on WhatsApp within minutes.',
      ],
      [
        4,
        [5, 3, 4, 4, 4],
        'Beautiful two-piece, great stitching. Delivery to Ibadan took a week instead of the promised four days, but they kept me updated throughout.',
      ],
      [
        2,
        [3, 1, 2, 2, 2],
        'The dress was fine but it came nine days late and I had already missed the event. I asked for a partial refund and was told to wait.',
      ],
      [
        5,
        [5, 5, 5, 5, 4],
        'Third order from them. Sizes are accurate if you follow their chart and the packaging is lovely. Slightly pricey but worth it.',
      ],
      [
        4,
        [4, 4, 4, 4, 4],
        'Good quality and honest photos. One button was loose but they sent a replacement button set with my next order.',
      ],
      [
        5,
        [5, 5, 5, 5, 5],
        'Customer service is the best I have seen from an Instagram vendor. Exchanged a size with no stress at all.',
      ],
    ],
  },
  {
    name: 'Adire Lane',
    category: 'fashion-clothing',
    description: 'Hand-dyed adire shirts, kaftans and fabrics from Abeokuta.',
    state: 'ogun',
    city: 'Abeokuta',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'adirelane' }],
    reviews: [
      [
        5,
        [5, 5, 5, 5, 5],
        'Gorgeous indigo kaftan. The dye did not run after washing, which has been my problem with other sellers.',
      ],
      [
        3,
        [4, 2, 3, 3, 3],
        'Lovely fabric but I had to chase them twice for a delivery update. It arrived eventually.',
      ],
    ],
  },
  {
    name: 'Threadline Menswear',
    category: 'fashion-clothing',
    description: 'Made-to-measure senator wear and suits.',
    state: 'fct',
    city: 'Abuja',
    area: 'Wuse 2',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'threadline.ng' }],
  },
  {
    name: 'Glow by Zainab',
    category: 'beauty-skincare-hair',
    description: 'Skincare consultations and handmade body butters.',
    state: 'kano',
    city: 'Kano',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'glowbyzainab' }],
    reviews: [
      [
        4,
        [4, 4, 5, 4, 4],
        'The body butter helped my dry skin within two weeks. Consultation was thorough and she did not push extra products.',
      ],
    ],
  },
  {
    name: 'Crown & Coils Salon',
    category: 'beauty-skincare-hair',
    description: 'Natural hair salon: braids, locs and treatments.',
    state: 'lagos',
    city: 'Lagos',
    area: 'Lekki Phase 1',
    website: 'https://crownandcoils.ng',
    identifiers: [
      { type: IdentifierType.INSTAGRAM, value: 'crownandcoils' },
      { type: IdentifierType.PHONE, value: '+2348098765432' },
    ],
    reviews: [
      [
        5,
        [5, 5, 5, 5, 4],
        'Knotless braids were neat and painless. They started at my appointment time, which never happens.',
      ],
      [
        2,
        [3, 1, 2, 2, 2],
        'Waited almost two hours past my booking and nobody apologised. The braids themselves were okay.',
      ],
      [
        4,
        [4, 4, 4, 5, 3],
        'Friendly stylists and a clean salon. A bit expensive for the area.',
      ],
    ],
  },
  {
    name: 'Barber Republic',
    category: 'beauty-skincare-hair',
    description: 'Barbershop with home-service option.',
    state: 'rivers',
    city: 'Port Harcourt',
    area: 'GRA Phase 2',
    identifiers: [
      { type: IdentifierType.INSTAGRAM, value: 'barberrepublicph' },
    ],
  },
  {
    name: 'Gadget Hub Ikeja',
    category: 'electronics-gadgets',
    description: 'Phones, laptops and accessories at Computer Village.',
    state: 'lagos',
    city: 'Lagos',
    area: 'Ikeja',
    website: 'https://gadgethubikeja.com',
    identifiers: [
      { type: IdentifierType.INSTAGRAM, value: 'gadgethub_ikeja' },
      { type: IdentifierType.CAC_NUMBER, value: 'RC1234567' },
    ],
    reviews: [
      [
        1,
        [1, 2, 1, 1, 1],
        'Sold me a "UK used" laptop whose battery died in a week. They refused to replace it and stopped answering calls.',
      ],
      [
        4,
        [4, 4, 4, 4, 4],
        'Bought an iPhone with a 3-month warranty. Phone works perfectly and they gave a receipt.',
      ],
      [
        3,
        [3, 3, 3, 3, 3],
        'Prices are fair but you need to test everything before you leave the shop.',
      ],
      [
        5,
        [5, 5, 4, 5, 5],
        'They fixed my cracked screen same day with an original part. Very professional.',
      ],
      [
        2,
        [2, 3, 2, 2, 2],
        'Charger they sold me stopped working after a month. Warranty claim took weeks.',
      ],
    ],
  },
  {
    name: 'Volt Phones Abuja',
    category: 'electronics-gadgets',
    description: 'Android phones and repairs.',
    state: 'fct',
    city: 'Abuja',
    area: 'Garki',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'voltphonesabuja' }],
  },
  {
    name: 'FixIt Laptops',
    category: 'electronics-gadgets',
    description:
      'Laptop repairs and refurbished laptops with pick-up and delivery.',
    state: 'oyo',
    city: 'Ibadan',
    area: 'Bodija',
    identifiers: [{ type: IdentifierType.WHATSAPP, value: '08055551234' }],
  },
  {
    name: 'Mama Put Kitchen',
    category: 'food-restaurants',
    description: 'Home-style Nigerian food: amala, ewedu, ofada and more.',
    state: 'lagos',
    city: 'Lagos',
    area: 'Surulere',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'mamaputkitchen' }],
    reviews: [
      [
        5,
        [5, 4, 4, 5, 5],
        'The best ofada sauce on the mainland. Generous portions for the price.',
      ],
      [
        4,
        [4, 3, 4, 4, 5],
        'Food is excellent; delivery took longer than the app said.',
      ],
    ],
  },
  {
    name: 'Suya Spot Wuse',
    category: 'food-restaurants',
    description: 'Late-night suya and grills.',
    state: 'fct',
    city: 'Abuja',
    area: 'Wuse',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'suyaspotwuse' }],
  },
  {
    name: 'Crumbs Bakery PH',
    category: 'food-restaurants',
    description: 'Custom cakes, small chops and pastries.',
    state: 'rivers',
    city: 'Port Harcourt',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'crumbsbakeryph' }],
  },
  {
    name: 'SwiftDrop Logistics',
    category: 'logistics-delivery',
    description: 'Same-day dispatch within Lagos and interstate delivery.',
    state: 'lagos',
    city: 'Lagos',
    nationwide: true,
    website: 'https://swiftdrop.ng',
    identifiers: [
      { type: IdentifierType.INSTAGRAM, value: 'swiftdrop.ng' },
      { type: IdentifierType.PHONE, value: '07011112222' },
    ],
    reviews: [
      [
        2,
        [2, 1, 2, 2, 3],
        'Rider picked up at 10am and delivered the next day. Tracking link never worked.',
      ],
      [
        4,
        [4, 4, 4, 4, 4],
        'Delivered fragile items to Abuja without damage. Fair price.',
      ],
      [
        5,
        [5, 5, 5, 5, 4],
        'Reliable for my small business. Riders call before arriving.',
      ],
    ],
  },
  {
    name: 'Ekiti Express Couriers',
    category: 'logistics-delivery',
    description: 'Parcel delivery between Ekiti, Ondo and Lagos.',
    state: 'ekiti',
    city: 'Ado-Ekiti',
    identifiers: [{ type: IdentifierType.PHONE, value: '08122223333' }],
  },
  {
    name: 'Kano Haulage Co',
    category: 'logistics-delivery',
    description: 'Haulage and moving services in the North.',
    state: 'kano',
    city: 'Kano',
    identifiers: [{ type: IdentifierType.CAC_NUMBER, value: 'RC7654321' }],
  },
  {
    name: 'SparkClean Services',
    category: 'general-services',
    description: 'Home and office deep cleaning, fumigation.',
    state: 'lagos',
    city: 'Lagos',
    area: 'Ajah',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'sparkcleanng' }],
    reviews: [
      [
        4,
        [4, 5, 4, 4, 4],
        'Thorough cleaning of a 3-bedroom flat. Arrived on time with their own equipment.',
      ],
    ],
  },
  {
    name: 'PrintPro Enugu',
    category: 'general-services',
    description: 'Printing, branding and souvenirs.',
    state: 'enugu',
    city: 'Enugu',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'printproenugu' }],
  },
  {
    name: 'Eventful Rentals',
    category: 'general-services',
    description: 'Chairs, canopies and décor for events.',
    state: 'oyo',
    city: 'Ibadan',
    identifiers: [{ type: IdentifierType.WHATSAPP, value: '09033334444' }],
  },
];

async function upsertUser(input: {
  email: string;
  password: string;
  displayName: string;
  username: string;
  location?: string;
  roleKey?: string;
  createdDaysAgo?: number;
}) {
  const role = input.roleKey
    ? await prisma.adminRole.findUniqueOrThrow({
        where: { key: input.roleKey },
      })
    : null;
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        emailVerified: true,
        adminRoleId: role?.id ?? existing.adminRoleId,
        location: existing.location ?? input.location ?? null,
      },
    });
  }
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 10),
      displayName: input.displayName,
      username: input.username,
      location: input.location ?? null,
      emailVerified: true,
      adminRoleId: role?.id ?? null,
      createdAt: new Date(Date.now() - (input.createdDaysAgo ?? 120) * DAY),
    },
  });
}

async function main() {
  const admin = await upsertUser({
    email: 'admin@revyu.ng',
    password: 'admin123',
    displayName: 'TalkGround Admin',
    username: 'talkground_admin',
    location: 'Lagos',
    roleKey: 'super_admin',
  });
  await upsertUser({
    email: 'moderator@example.com',
    password: 'demo1234',
    displayName: 'Tolu (Moderator)',
    username: 'tolu_moderator',
    roleKey: 'moderator',
  });
  const chinedu = await upsertUser({
    email: 'chinedu.okafor@gmail.com',
    password: 'demo1234',
    displayName: 'Chinedu Okafor',
    username: 'chinedu_okafor',
    location: 'Lagos',
  });
  const owner = await upsertUser({
    email: 'owner@example.com',
    password: 'demo1234',
    displayName: 'Kemi Adebayo',
    username: 'kemi_adebayo',
    location: 'Lagos',
  });
  const reviewers = [chinedu];
  const names = [
    'Ada Nwosu',
    'Ibrahim Musa',
    'Funmi Ojo',
    'Emeka Eze',
    'Halima Bello',
    'Tunde Bakare',
  ];
  for (let i = 0; i < names.length; i++) {
    reviewers.push(
      await upsertUser({
        email: `reviewer${i + 1}@example.com`,
        password: 'demo1234',
        displayName: names[i],
        username: names[i].toLowerCase().replace(' ', '_'),
        location: [
          'Lagos',
          'Kano',
          'Ibadan',
          'Enugu',
          'Abuja',
          'Port Harcourt',
        ][i],
      }),
    );
  }

  let created = 0;
  for (const [index, b] of BUSINESSES.entries()) {
    const slug = slugify(b.name);
    if (await prisma.business.findUnique({ where: { slug } })) continue;
    const categoryId = await writer.categoryIdBySlug(b.category);
    const business = await writer.create({
      name: b.name,
      categoryId,
      description: b.description,
      website: b.website ?? null,
      identifiers: b.identifiers,
      locations: [
        {
          state: b.state,
          city: b.city,
          area: b.area,
          nationwide: b.nationwide ?? false,
        },
      ],
      status: BusinessStatus.PUBLISHED,
      source: BusinessSource.ADMIN,
      createdById: admin.id,
    });
    await prisma.business.update({
      where: { id: business.id },
      data: { publishedAt: new Date(Date.now() - (60 - index) * DAY) },
    });
    created++;

    const dims = await prisma.categoryDimension.findMany({
      where: { categoryId },
      orderBy: { sortOrder: 'asc' },
    });
    for (const [i, [rating, scores, body]] of (b.reviews ?? []).entries()) {
      const author = reviewers[i % reviewers.length];
      const createdAt = new Date(Date.now() - (50 - i * 7) * DAY);
      await prisma.review.create({
        data: {
          businessId: business.id,
          userId: author.id,
          overallRating: rating,
          body,
          title: body.split('. ')[0].slice(0, 60),
          status: ReviewStatus.PUBLISHED,
          activeKey: `${business.id}:${author.id}`,
          publishedAt: createdAt,
          createdAt,
          experienceDate: new Date(createdAt.getTime() - 3 * DAY),
          dimensions: {
            create: dims.map((d, k) => ({
              dimensionId: d.dimensionId,
              score: scores[k] ?? rating,
            })),
          },
        },
      });
    }
    await ratings.recompute(business.id);
  }

  // Kemi's Closet: verified owner, one official response and a proposed resolution.
  const kemi = await prisma.business.findUniqueOrThrow({
    where: { slug: slugify("Kemi's Closet") },
  });
  const member = await prisma.businessMember.findUnique({
    where: { businessId_userId: { businessId: kemi.id, userId: owner.id } },
  });
  if (!member) {
    await prisma.businessMember.create({
      data: { businessId: kemi.id, userId: owner.id, role: MemberRole.OWNER },
    });
    await prisma.business.update({
      where: { id: kemi.id },
      data: { ownershipStatus: OwnershipStatus.VERIFIED },
    });
    const complaint = await prisma.review.findFirst({
      where: { businessId: kemi.id, overallRating: 2 },
    });
    if (complaint) {
      await prisma.businessResponse.create({
        data: {
          reviewId: complaint.id,
          businessId: kemi.id,
          authorId: owner.id,
          body: "We're sorry your order arrived late. Our courier lost the parcel for four days. We have refunded your delivery fee and switched couriers.",
        },
      });
      await prisma.review.update({
        where: { id: complaint.id },
        data: { resolutionStatus: ResolutionStatus.RESOLUTION_PROPOSED },
      });
      await prisma.resolutionEvent.createMany({
        data: [
          {
            reviewId: complaint.id,
            status: ResolutionStatus.BUSINESS_RESPONDED,
            actorType: 'SYSTEM',
          },
          {
            reviewId: complaint.id,
            status: ResolutionStatus.RESOLUTION_PROPOSED,
            actorType: 'BUSINESS',
            actorId: owner.id,
            note: 'Delivery fee refunded on 14 Nov.',
          },
        ],
      });
    }
  }

  const counts = {
    businesses: await prisma.business.count(),
    reviews: await prisma.review.count(),
    users: await prisma.user.count(),
  };
  console.log(`Seed complete. New businesses: ${created}.`, counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
