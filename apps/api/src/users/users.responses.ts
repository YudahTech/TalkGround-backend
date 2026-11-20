import { ApiProperty } from '@nestjs/swagger';

export class StaffRoleDto {
  @ApiProperty({ example: 'moderator' }) key: string;
  @ApiProperty({ example: 'Moderator' }) name: string;
}

/** The signed-in account (login, register, refresh, GET /users/me). */
export class AccountDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() username: string;
  @ApiProperty() displayName: string;
  @ApiProperty() emailVerified: boolean;
  @ApiProperty() phoneVerified: boolean;
  @ApiProperty({ nullable: true }) phone: string | null;
  @ApiProperty({ nullable: true }) avatarUrl: string | null;
  @ApiProperty({ nullable: true }) bio: string | null;
  @ApiProperty({ nullable: true }) location: string | null;
  @ApiProperty() isStaff: boolean;
  @ApiProperty({ type: StaffRoleDto, nullable: true })
  staffRole: StaffRoleDto | null;
  @ApiProperty({
    type: [String],
    example: ['review.moderate'],
    description: 'PRD §9 permission keys (staff only)',
  })
  permissions: string[];
  @ApiProperty() createdAt: Date;
}

export class PublicProfileReviewDto {
  @ApiProperty() id: string;
  @ApiProperty() overallRating: number;
  @ApiProperty() title: string;
  @ApiProperty() excerpt: string;
  @ApiProperty() helpfulCount: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty({
    type: 'object',
    properties: { name: { type: 'string' }, slug: { type: 'string' } },
  })
  business: { name: string; slug: string };
}

export class PublicProfileDto {
  @ApiProperty() displayName: string;
  @ApiProperty() username: string;
  @ApiProperty({ nullable: true }) avatarUrl: string | null;
  @ApiProperty({ nullable: true }) bio: string | null;
  @ApiProperty({ nullable: true }) location: string | null;
  @ApiProperty() memberSince: Date;
  @ApiProperty() reviewCount: number;
  @ApiProperty({ type: [PublicProfileReviewDto] })
  reviews: PublicProfileReviewDto[];
}

export class DataExportDto {
  @ApiProperty() exportedAt: Date;
  @ApiProperty({
    description:
      'Account fields plus reviews, votes, reports, submissions, claims and memberships',
  })
  id: string;
}
