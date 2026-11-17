import {
  Brand,
  BrandCategory,
  City,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Matches ReviewInterest enum in schema.prisma */
const DEFAULT_INTERESTS = ['RESTAURANTS', 'HOTELS'] as const;

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);
  const demoPasswordHash = await bcrypt.hash('demo1234', 10);

  await prisma.user.upsert({
    where: { email: 'admin@revyu.ng' },
    update: {
      city: City.LAGOS,
      bio: 'TalkGround platform administrator.',
      interests: [...DEFAULT_INTERESTS],
    },
    create: {
      email: 'admin@revyu.ng',
      passwordHash,
      displayName: 'TalkGround Admin',
      username: 'talkground_admin',
      phone: '+2348000000000',
      emailVerified: true,
      phoneVerified: true,
      role: UserRole.ADMIN,
      city: City.LAGOS,
      bio: 'TalkGround platform administrator.',
      interests: [...DEFAULT_INTERESTS],
    },
  });

  const demoUser = await prisma.user.upsert({
    where: { email: 'chinedu.okafor@gmail.com' },
    update: {
      city: City.LAGOS,
      bio: 'Tech enthusiast and food lover exploring the best of Lagos.',
      interests: [...DEFAULT_INTERESTS],
      emailVerified: true,
      phoneVerified: true,
    },
    create: {
      email: 'chinedu.okafor@gmail.com',
      passwordHash: demoPasswordHash,
      displayName: 'Chinedu Okafor',
      username: 'chinedu_okafor',
      phone: '+2348012345678',
      emailVerified: true,
      phoneVerified: true,
      role: UserRole.USER,
      city: City.LAGOS,
      bio: 'Tech enthusiast and food lover exploring the best of Lagos.',
      interests: [...DEFAULT_INTERESTS],
    },
  });

  const brands = [
    {
      name: "Nexxa's Kitchen",
      slug: 'nexxas-kitchen',
      description:
        'Authentic Nigerian cuisine in Victoria Island. Known for pepper soup, jollof, and grilled fish.',
      category: BrandCategory.RESTAURANTS,
      subType: 'BUKA',
      tags: ['Dining', 'Local Cuisine', 'Victoria Island'],
      city: City.LAGOS,
      area: 'Victoria Island',
      website: 'https://example.com',
      logoUrl: null,
      claimed: true,
    },
    {
      name: 'Jollof Palace',
      slug: 'jollof-palace',
      description:
        'Traditional jollof and grilled specials in Lekki. Popular weekend spot for families.',
      category: BrandCategory.RESTAURANTS,
      subType: 'CASUAL',
      tags: ['Dining', 'Jollof', 'Lekki'],
      city: City.LAGOS,
      area: 'Lekki',
      website: null,
      logoUrl: null,
      claimed: false,
    },
    {
      name: 'Transcorp Hilton Abuja',
      slug: 'transcorp-hilton-abuja',
      description:
        'Landmark luxury hotel in the heart of Abuja with restaurants, pool, and conference facilities.',
      category: BrandCategory.HOTELS,
      subType: 'HOTEL',
      tags: ['Hotels', 'Luxury', 'CBD'],
      city: City.ABUJA,
      area: 'Central Business District',
      website: 'https://www.hilton.com',
      logoUrl: null,
      claimed: true,
    },
    {
      name: 'Skyline Shortlets',
      slug: 'skyline-shortlets',
      description:
        'Serviced apartments for short stays in Garki. Clean rooms and reliable power.',
      category: BrandCategory.HOTELS,
      subType: 'SHORT_LET',
      tags: ['Short Let', 'Serviced Apartments', 'Garki'],
      city: City.ABUJA,
      area: 'Garki',
      website: null,
      logoUrl: null,
      claimed: false,
    },
  ];

  const brandRecords: Brand[] = [];
  for (const brand of brands) {
    const record = await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: brand,
      create: brand,
    });
    brandRecords.push(record);
  }

  const sampleReviews = [
    {
      brandSlug: 'nexxas-kitchen',
      rating: 5,
      title: 'Best pepper soup in VI',
      body: 'Visited on a Friday evening with colleagues. The pepper soup was rich and spicy, jollof portion was generous, and service was warm. Will definitely return for a proper Lagos buka experience.',
      recommend: true,
      verifiedVisit: true,
      viewCount: 42,
    },
    {
      brandSlug: 'jollof-palace',
      rating: 4,
      title: 'Solid jollof, busy on weekends',
      body: 'The smoky party jollof lives up to the hype. Grilled chicken was well seasoned. Only downside was a 25-minute wait on a Saturday night, but the food made up for it.',
      recommend: true,
      verifiedVisit: false,
      viewCount: 28,
    },
    {
      brandSlug: 'transcorp-hilton-abuja',
      rating: 4,
      title: 'Excellent stay, premium dining',
      body: 'Stayed two nights for a conference. Room was spotless, breakfast buffet had good variety, and staff were professional. Pricey but expected for this tier in Abuja CBD.',
      recommend: true,
      verifiedVisit: true,
      viewCount: 67,
    },
    {
      brandSlug: 'skyline-shortlets',
      rating: 3,
      title: 'Decent short let, patchy Wi-Fi',
      body: 'Apartment was clean and secure in Garki. Generator worked when power went off. Wi-Fi dropped a few times which was frustrating for remote work, but overall fair value.',
      recommend: false,
      verifiedVisit: false,
      viewCount: 15,
    },
  ];

  for (const review of sampleReviews) {
    const brand = brandRecords.find((b) => b.slug === review.brandSlug);
    if (!brand) continue;

    await prisma.review.upsert({
      where: {
        brandId_userId: { brandId: brand.id, userId: demoUser.id },
      },
      update: {
        rating: review.rating,
        title: review.title,
        body: review.body,
        recommend: review.recommend,
        verifiedVisit: review.verifiedVisit,
        viewCount: review.viewCount,
      },
      create: {
        brandId: brand.id,
        userId: demoUser.id,
        rating: review.rating,
        title: review.title,
        body: review.body,
        recommend: review.recommend,
        verifiedVisit: review.verifiedVisit,
        viewCount: review.viewCount,
      },
    });
  }

  console.log('Seed complete:');
  console.log('  Admin: admin@revyu.ng / admin123');
  console.log('  Demo user: chinedu.okafor@gmail.com / demo1234');
  console.log(`  ${brandRecords.length} brands + ${sampleReviews.length} sample reviews`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
