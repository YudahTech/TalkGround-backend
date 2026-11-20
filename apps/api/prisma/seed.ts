/**
 * Demo data for LOCAL and STAGING only (PRD v2.5 §15: no demo or default credentials in production).
 * Idempotent: safe to run repeatedly.
 *
 * - Refuses to run when NODE_ENV=production.
 * - No password is stored in this file. New demo accounts get SEED_DEMO_PASSWORD / SEED_ADMIN_PASSWORD
 *   or a generated password that is printed once. Set SEED_RESET_PASSWORDS=true to rotate the
 *   passwords of existing demo accounts.
 * - Demo accounts use the reserved .test domain, so no email can ever be delivered to them.
 * - Legacy demo accounts from earlier versions (revyu / example.com / a gmail address) are renamed
 *   to .test addresses and their passwords rotated.
 *
 * Businesses are fictional.
 */
import {
  BusinessStatus,
  IdentifierType,
  ListingSource,
  MemberRole,
  OwnershipStatus,
  PrismaClient,
  ResolutionStatus,
  ReviewStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { RatingsService } from '../src/businesses/ratings.service';
import { BusinessWriterService } from '../src/businesses/business-writer.service';
import { AppConfig } from '../src/common/app-config';
import type { PrismaService } from '../src/prisma/prisma.service';
import { slugify } from '../src/common/utils';

if (process.env.NODE_ENV === 'production') {
  console.error(
    'Refusing to seed demo data with NODE_ENV=production (PRD §15).',
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const ratings = new RatingsService(db, new AppConfig(new ConfigService()));
const writer = new BusinessWriterService(db, ratings);
const DAY = 86_400_000;
const resetPasswords = process.env.SEED_RESET_PASSWORDS === 'true';
const changed: string[] = [];

const generated = () => randomBytes(12).toString('base64url');
const demoPassword = process.env.SEED_DEMO_PASSWORD || generated();
const adminPassword = process.env.SEED_ADMIN_PASSWORD || generated();

/** Old demo addresses → new .test addresses. */
const LEGACY: Record<string, string> = {
  'admin@revyu.ng': 'admin@talkground.test',
  'chinedu.okafor@gmail.com': 'chinedu@talkground.test',
  'moderator@example.com': 'moderator@talkground.test',
  'owner@example.com': 'owner@talkground.test',
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((i) => [
      `reviewer${i}@example.com`,
      `reviewer${i}@talkground.test`,
    ]),
  ),
};

const CITIES: [string, string][] = [
  ['Lagos', 'Lagos'],
  ['Abuja', 'Federal Capital Territory'],
  ['Abeokuta', 'Ogun'],
  ['Kano', 'Kano'],
  ['Port Harcourt', 'Rivers'],
  ['Ibadan', 'Oyo'],
  ['Enugu', 'Enugu'],
  ['Ado-Ekiti', 'Ekiti'],
];

type SeedBusiness = {
  name: string;
  category: string;
  description: string;
  city?: string;
  area?: string;
  onlineOnly?: boolean;
  website?: string;
  identifiers: { type: IdentifierType; value: string }[];
  /** [overall, dimension values in the category's order, title, body] */
  reviews?: [number, number[], string, string][];
};

const BUSINESSES: SeedBusiness[] = [
  {
    name: "Kemi's Closet",
    category: 'fashion-and-clothing',
    description:
      'Ready-to-wear dresses and two-piece sets sold on Instagram, made in Yaba, Lagos, with delivery across Nigeria.',
    city: 'lagos',
    area: 'Yaba',
    website: 'https://kemiscloset.ng',
    identifiers: [
      { type: IdentifierType.INSTAGRAM, value: '@kemis_closet' },
      { type: IdentifierType.TIKTOK, value: '@kemiscloset' },
      { type: IdentifierType.PHONE, value: '08031234567' },
      { type: IdentifierType.ALT_NAME, value: 'Kemi Closet NG' },
    ],
    reviews: [
      [
        5,
        [5, 4, 4, 5],
        'Beautiful wedding dresses',
        'Ordered two dresses for a wedding. The fabric was even better than the photos and they arrived in three days.',
      ],
      [
        4,
        [5, 4, 3, 4],
        'Great stitching, slow delivery',
        'Beautiful two-piece with great stitching. Delivery to Ibadan took a week instead of four days, but they kept me updated.',
      ],
      [
        2,
        [3, 3, 1, 2],
        'Arrived too late for my event',
        'The dress was fine but it came nine days late and I had already missed the event. I asked for a partial refund and was told to wait.',
      ],
      [
        5,
        [5, 5, 5, 4],
        'Third order, still great',
        'Third order from them. Sizes are accurate if you follow their chart and the packaging is lovely. Slightly pricey but worth it.',
      ],
      [
        4,
        [4, 4, 4, 4],
        'Honest photos',
        'Good quality and honest photos. One button was loose but they sent a replacement button set with my next order.',
      ],
      [
        5,
        [5, 5, 5, 5],
        'Easy size exchange',
        'Customer service is the best I have seen from an Instagram vendor. They exchanged a size for me with no stress at all.',
      ],
    ],
  },
  {
    name: 'Adire Lane',
    category: 'fashion-and-clothing',
    description:
      'Hand-dyed adire shirts, kaftans and fabrics made in Abeokuta and shipped nationwide.',
    city: 'abeokuta',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'adirelane' }],
    reviews: [
      [
        5,
        [5, 5, 5, 5],
        'Indigo kaftan that lasts',
        'Gorgeous indigo kaftan. The dye did not run after washing, which has been my problem with other sellers.',
      ],
      [
        3,
        [4, 3, 2, 3],
        'Lovely fabric, slow updates',
        'Lovely fabric but I had to chase them twice for a delivery update before it finally arrived.',
      ],
    ],
  },
  {
    name: 'Threadline Menswear',
    category: 'fashion-and-clothing',
    description: 'Made-to-measure senator wear and suits.',
    city: 'abuja',
    area: 'Wuse 2',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'threadline.ng' }],
  },
  {
    name: 'Glow by Zainab',
    category: 'beauty-skincare-and-hair',
    description:
      'Skincare consultations and handmade shea body butters from Kano, with delivery to other states.',
    city: 'kano',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'glowbyzainab' }],
    reviews: [
      [
        4,
        [4, 4, 5, 4, 4],
        'Helped my dry skin',
        'The body butter helped my dry skin within two weeks. The consultation was thorough and she did not push extra products.',
      ],
    ],
  },
  {
    name: 'Crown & Coils Salon',
    category: 'beauty-skincare-and-hair',
    description:
      'Natural hair salon in Lekki Phase 1 offering braids, locs, silk presses and scalp treatments by appointment.',
    city: 'lagos',
    area: 'Lekki Phase 1',
    website: 'https://crownandcoils.ng',
    identifiers: [
      { type: IdentifierType.INSTAGRAM, value: 'crownandcoils' },
      { type: IdentifierType.PHONE, value: '+2348098765432' },
    ],
    reviews: [
      [
        5,
        [5, 4, 5, 5, 4],
        'Neat, painless braids',
        'Knotless braids were neat and painless. They started at my appointment time, which almost never happens.',
      ],
      [
        2,
        [3, 3, 3, 1, 2],
        'Two hours late',
        'Waited almost two hours past my booking and nobody apologised. The braids themselves were okay.',
      ],
      [
        4,
        [4, 4, 5, 4, 3],
        'Friendly and clean',
        'Friendly stylists and a very clean salon. It is a bit expensive for the area but the work is good.',
      ],
    ],
  },
  {
    name: 'Barber Republic',
    category: 'beauty-skincare-and-hair',
    description: 'Barbershop with home service.',
    city: 'port-harcourt',
    area: 'GRA Phase 2',
    identifiers: [],
  },
  {
    name: 'Gadget Hub Ikeja',
    category: 'electronics-and-gadgets',
    description:
      'Phones, laptops and accessories at Computer Village, Ikeja, with repairs and a 3-month warranty on UK-used devices.',
    city: 'lagos',
    area: 'Ikeja',
    website: 'https://gadgethubikeja.com',
    identifiers: [
      { type: IdentifierType.INSTAGRAM, value: 'gadgethub_ikeja' },
      { type: IdentifierType.OTHER, value: 'RC1234567' },
    ],
    reviews: [
      [
        1,
        [1, 2, 1, 1],
        'Battery died in a week',
        'Sold me a UK-used laptop whose battery died in a week. They refused to replace it and stopped answering calls.',
      ],
      [
        4,
        [4, 4, 4, 4],
        'Working iPhone with receipt',
        'Bought an iPhone with a 3-month warranty. The phone works perfectly and they gave me a proper receipt.',
      ],
      [
        3,
        [3, 3, 3, 3],
        'Test before you leave',
        'Prices are fair but you need to test everything carefully before you leave the shop.',
      ],
      [
        5,
        [5, 5, 5, 5],
        'Same-day screen repair',
        'They fixed my cracked screen the same day with an original part. Very professional service.',
      ],
      [
        2,
        [2, 3, 2, 2],
        'Charger stopped working',
        'The charger they sold me stopped working after a month, and the warranty claim took weeks.',
      ],
    ],
  },
  {
    name: 'Volt Phones Abuja',
    category: 'electronics-and-gadgets',
    description:
      'Android phones, accessories and repairs in Garki, Abuja, including screen and battery replacement.',
    city: 'abuja',
    area: 'Garki',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'voltphonesabuja' }],
  },
  {
    name: 'FixIt Laptops',
    category: 'electronics-and-gadgets',
    description:
      'Laptop repairs and refurbished laptops with pick-up and delivery in Ibadan.',
    city: 'ibadan',
    area: 'Bodija',
    identifiers: [{ type: IdentifierType.PHONE, value: '08055551234' }],
  },
  {
    name: 'Mama Put Kitchen',
    category: 'food-and-restaurants',
    description:
      'Home-style Nigerian food in Surulere: amala and ewedu, ofada rice, pepper soup and daily specials, with delivery.',
    city: 'lagos',
    area: 'Surulere',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'mamaput_lagos' }],
    reviews: [
      [
        5,
        [5, 4, 5, 4, 5],
        'Best ofada sauce',
        'The best ofada sauce on the mainland, and the portions are generous for the price.',
      ],
      [
        4,
        [4, 4, 4, 3, 5],
        'Great food, slow delivery',
        'The food is excellent, but delivery took longer than the app said it would.',
      ],
    ],
  },
  {
    name: 'Suya Spot Wuse',
    category: 'food-and-restaurants',
    description: 'Late-night suya and grills.',
    city: 'abuja',
    area: 'Wuse',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'suyaspotwuse' }],
  },
  {
    name: 'Crumbs Bakery PH',
    category: 'food-and-restaurants',
    description:
      'Custom cakes, small chops and pastries for events in Port Harcourt, ordered at least two days ahead.',
    city: 'port-harcourt',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'crumbsbakeryph' }],
  },
  {
    name: 'SwiftDrop Logistics',
    category: 'logistics-and-delivery',
    description:
      'Same-day dispatch within Lagos and interstate parcel delivery, with phone updates from the rider.',
    city: 'lagos',
    website: 'https://swiftdrop.ng',
    identifiers: [
      { type: IdentifierType.INSTAGRAM, value: 'swiftdrop.ng' },
      { type: IdentifierType.PHONE, value: '07011112222' },
    ],
    reviews: [
      [
        2,
        [1, 2, 2, 3],
        'Next-day "same day"',
        'The rider picked up at 10am and delivered the next day. The tracking link never worked.',
      ],
      [
        4,
        [4, 4, 4, 4],
        'Fragile items arrived safely',
        'They delivered fragile items to Abuja without any damage, at a fair price.',
      ],
      [
        5,
        [5, 5, 5, 4],
        'Reliable for my shop',
        'Reliable for my small business. The riders always call before they arrive.',
      ],
    ],
  },
  {
    name: 'Ekiti Express Couriers',
    category: 'logistics-and-delivery',
    description: 'Parcel delivery between Ekiti, Ondo and Lagos.',
    city: 'ado-ekiti',
    identifiers: [{ type: IdentifierType.PHONE, value: '08122223333' }],
  },
  {
    name: 'Kano Haulage Co',
    category: 'logistics-and-delivery',
    description:
      'Haulage and moving services across northern Nigeria, with trucks for household and commercial moves.',
    city: 'kano',
    identifiers: [{ type: IdentifierType.OTHER, value: 'RC7654321' }],
  },
  {
    name: 'SparkClean Services',
    category: 'general-consumer-services',
    description:
      'Home and office deep cleaning and fumigation in Ajah and Lekki, with their own equipment and products.',
    city: 'lagos',
    area: 'Ajah',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'sparkcleanng' }],
    reviews: [
      [
        4,
        [4, 4, 5, 4],
        'Thorough deep clean',
        'Thorough cleaning of a 3-bedroom flat. They arrived on time with their own equipment.',
      ],
    ],
  },
  {
    name: 'PrintPro Enugu',
    category: 'general-consumer-services',
    description: 'Printing, branding and souvenirs.',
    city: 'enugu',
    identifiers: [{ type: IdentifierType.INSTAGRAM, value: 'printproenugu' }],
  },
  {
    name: 'Eventful Rentals',
    category: 'general-consumer-services',
    description:
      'Chairs, canopies, tables and décor for weddings and parties in Ibadan, with set-up and pick-up included.',
    city: 'ibadan',
    identifiers: [{ type: IdentifierType.PHONE, value: '09033334444' }],
  },
];

async function upsertUser(input: {
  email: string;
  displayName: string;
  username: string;
  location?: string;
  roleKey?: string;
  admin?: boolean;
}) {
  const role = input.roleKey
    ? await prisma.adminRole.findUniqueOrThrow({
        where: { key: input.roleKey },
      })
    : null;
  const password = input.admin ? adminPassword : demoPassword;
  // Rename a legacy demo account to its new address (keeps its id, reviews and history).
  const legacy = Object.entries(LEGACY).find(
    ([, next]) => next === input.email,
  )?.[0];
  if (legacy) {
    const old = await prisma.user.findUnique({ where: { email: legacy } });
    if (
      old &&
      !(await prisma.user.findUnique({ where: { email: input.email } }))
    ) {
      await prisma.user.update({
        where: { id: old.id },
        data: {
          email: input.email,
          passwordHash: await bcrypt.hash(password, 12),
          tokenVersion: { increment: 1 },
        },
      });
      await prisma.refreshToken.updateMany({
        where: { userId: old.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      changed.push(`${input.email} (renamed from ${legacy}; password rotated)`);
    }
  }
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    const alreadyRotated = changed.some((c) => c.startsWith(`${input.email} `));
    if (resetPasswords && !alreadyRotated) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: await bcrypt.hash(password, 12),
          tokenVersion: { increment: 1 },
        },
      });
      changed.push(`${input.email} (password rotated)`);
    }
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        emailVerified: true,
        adminRoleId: role?.id ?? existing.adminRoleId,
      },
    });
  }
  changed.push(`${input.email} (created)`);
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await bcrypt.hash(password, 12),
      displayName: input.displayName,
      username: input.username,
      location: input.location ?? null,
      emailVerified: true,
      adminRoleId: role?.id ?? null,
      createdAt: new Date(Date.now() - 120 * DAY),
    },
  });
}

async function main() {
  for (const [name, state] of CITIES) {
    await prisma.city.upsert({
      where: { slug: slugify(name) },
      create: { slug: slugify(name), name, state },
      update: {},
    });
  }

  const admin = await upsertUser({
    email: 'admin@talkground.test',
    displayName: 'TalkGround Admin',
    username: 'talkground_admin',
    location: 'Lagos',
    roleKey: 'super_admin',
    admin: true,
  });
  await upsertUser({
    email: 'moderator@talkground.test',
    displayName: 'Tolu (Moderator)',
    username: 'tolu_moderator',
    roleKey: 'moderator',
  });
  await upsertUser({
    email: 'listings@talkground.test',
    displayName: 'Bisi (Admin)',
    username: 'bisi_admin',
    roleKey: 'admin',
  });
  const chinedu = await upsertUser({
    email: 'chinedu@talkground.test',
    displayName: 'Chinedu Okafor',
    username: 'chinedu_okafor',
    location: 'Lagos',
  });
  const owner = await upsertUser({
    email: 'owner@talkground.test',
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
        email: `reviewer${i + 1}@talkground.test`,
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
    if (await prisma.business.findUnique({ where: { slug: slugify(b.name) } }))
      continue;
    const categoryId = await writer.categoryIdBySlug(b.category);
    const location = await writer.resolveLocation({
      city: b.city,
      area: b.area,
      onlineOnly: b.onlineOnly,
    });
    const business = await writer.create({
      name: b.name,
      categoryId,
      ...location,
      description: b.description,
      website: b.website ?? null,
      identifiers: b.identifiers,
      status: BusinessStatus.PUBLISHED,
      createdBySource: ListingSource.ADMIN,
      createdById: admin.id,
    });
    await prisma.business.update({
      where: { id: business.id },
      data: { publishedAt: new Date(Date.now() - (60 - index) * DAY) },
    });
    created++;
    const dims = await prisma.categoryDimension.findMany({
      where: { categoryId },
      orderBy: { order: 'asc' },
    });
    for (const [i, [rating, values, title, body]] of (
      b.reviews ?? []
    ).entries()) {
      const author = reviewers[i % reviewers.length];
      const createdAt = new Date(Date.now() - (50 - i * 7) * DAY);
      await prisma.review.create({
        data: {
          businessId: business.id,
          userId: author.id,
          overallRating: rating,
          title,
          body,
          status: ReviewStatus.PUBLISHED,
          activeKey: `${business.id}:${author.id}`,
          publishedAt: createdAt,
          createdAt,
          dimensionRatings: {
            create: dims.map((d, k) => ({
              dimensionId: d.dimensionId,
              value: values[k] ?? rating,
            })),
          },
        },
      });
    }
    await ratings.recompute(business.id);
  }

  // Kemi's Closet: verified owner, one response and a proposed resolution.
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
      data: {
        ownershipStatus: OwnershipStatus.CLAIMED,
        ownershipVerified: true,
      },
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
          body: "We're sorry your order arrived late. Our courier lost the parcel for four days. We have refunded your delivery fee and changed couriers.",
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

  console.log(`Seed complete. New businesses: ${created}.`, {
    businesses: await prisma.business.count(),
    reviews: await prisma.review.count(),
    users: await prisma.user.count(),
  });
  if (changed.length) {
    console.log(
      '\nAccounts created or changed in this run (passwords shown ONCE — store them in a password manager):',
    );
    for (const line of changed) console.log(`  ${line}`);
    if (changed.some((l) => l.startsWith('admin@')))
      console.log(`  admin password: ${adminPassword}`);
    if (changed.some((l) => !l.startsWith('admin@')))
      console.log(
        `  password for all other changed demo accounts: ${demoPassword}`,
      );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
