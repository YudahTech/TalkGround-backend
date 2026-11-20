-- TalkGround PRD v2.5 alignment (API 2.5).
--
-- Data policy (staging holds only generated demo data): KEEP users, sessions, OTPs, password
-- resets, the audit log (append-only — existing rows are never rewritten), waitlist and survey.
-- REBUILD the business domain to the PRD v2.5 data model (section 13); demo data is reseeded.
--
-- Order: staff roles -> audit columns -> drop old domain -> create new domain ->
-- reference data -> search trigger.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. Staff permissions become PRD §9 permission keys (text), roles become moderator/admin/super_admin.
ALTER TABLE "AdminRole" ALTER COLUMN "permissions" TYPE TEXT[] USING "permissions"::text[];

UPDATE "AdminRole" SET
  "name" = 'Super Admin',
  "description" = 'Every permission, including role assignment and audit export.',
  "permissions" = ARRAY['review.moderate','report.resolve','evidence.review','suggestion.resolve','claim.decide','business.create','business.edit','business.suspend','business.merge','dispute.decide','user.suspend','category.manage','role.assign','auditlog.export'],
  "isSystem" = true, "updatedAt" = now()
WHERE "key" = 'super_admin';

UPDATE "AdminRole" SET
  "name" = 'Moderator',
  "description" = 'Reviews, reports, evidence and business suggestions.',
  "permissions" = ARRAY['review.moderate','report.resolve','evidence.review','suggestion.resolve'],
  "isSystem" = true, "updatedAt" = now()
WHERE "key" = 'moderator';

INSERT INTO "AdminRole" ("id", "key", "name", "description", "permissions", "isSystem", "updatedAt")
SELECT gen_random_uuid()::text, 'admin', 'Admin',
  'Moderator powers plus listings, claims, disputes, users and categories.',
  ARRAY['review.moderate','report.resolve','evidence.review','suggestion.resolve','claim.decide','business.create','business.edit','business.suspend','business.merge','dispute.decide','user.suspend','category.manage'],
  true, now()
WHERE NOT EXISTS (SELECT 1 FROM "AdminRole" WHERE "key" = 'admin');

-- Roles outside the PRD table move to Admin, then are removed.
UPDATE "User" SET "adminRoleId" = (SELECT "id" FROM "AdminRole" WHERE "key" = 'admin')
WHERE "adminRoleId" IN (SELECT "id" FROM "AdminRole" WHERE "key" NOT IN ('super_admin', 'admin', 'moderator'));
DELETE FROM "AdminRole" WHERE "key" NOT IN ('super_admin', 'admin', 'moderator');

DROP TYPE IF EXISTS "AdminPermission";

-- 2. Audit log: before/after values and reason (PRD §8.5). Existing rows are left untouched.
ALTER TABLE "AuditLog" ADD COLUMN "before" JSONB, ADD COLUMN "after" JSONB, ADD COLUMN "reason" TEXT;

-- 3. Retire the API 2.0 business domain.
DROP TABLE IF EXISTS "ModerationAction", "ReviewFlag", "BusinessDispute", "ReviewReport", "HelpfulVote",
  "ResolutionEvent", "ResponseRevision", "BusinessResponse", "ReviewEvidence", "ReviewRevision",
  "ReviewDimension", "Review", "BusinessMember", "ClaimDocument", "BusinessClaim", "BusinessSubmission",
  "BusinessLocation", "BusinessIdentifier", "Business", "CategoryDimension", "RatingDimension",
  "BusinessCategory" CASCADE;
DROP FUNCTION IF EXISTS business_search_vector() CASCADE;
DROP TYPE IF EXISTS "BusinessStatus", "OwnershipStatus", "BusinessSource", "IdentifierType", "LocationType",
  "SubmissionSource", "SubmissionStatus", "ClaimStatus", "VerificationMethod", "MemberRole", "ReviewStatus",
  "EvidenceKind", "EvidenceStatus", "ResolutionStatus", "ActorType", "VoteValue", "ResponseStatus",
  "ReportReason", "ReporterType", "ReportStatus", "DisputeStatus", "FlagType", "ModerationTarget",
  "ModerationActionType", "PolicyReason";

-- 4. New domain (generated from schema.prisma).

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('SUGGESTED', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'SUSPENDED', 'MERGED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OwnershipStatus" AS ENUM ('UNCLAIMED', 'CLAIM_PENDING', 'CLAIMED');

-- CreateEnum
CREATE TYPE "ListingSource" AS ENUM ('ADMIN', 'CONSUMER', 'OWNER');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'X', 'WEBSITE', 'PHONE', 'EMAIL', 'ALT_NAME', 'OTHER');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('BUSINESS_EMAIL', 'WEBSITE_DOMAIN', 'SOCIAL_ACCOUNT', 'DOCUMENTS', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'UNDER_INVESTIGATION', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('NOT_REVIEWED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('PHOTO', 'RECEIPT');

-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('NONE', 'BUSINESS_RESPONDED', 'RESOLUTION_PROPOSED', 'RESOLVED_BY_CONSUMER', 'REOPENED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('CONSUMER', 'BUSINESS', 'SYSTEM', 'STAFF');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('PUBLISHED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('FAKE_OR_NEVER_VISITED', 'SPAM_OR_PROMOTIONAL', 'PERSONAL_INFO', 'HARASSMENT_OR_ABUSE', 'CONFLICT_OF_INTEREST', 'PAID_OR_INCENTIVISED', 'IMPERSONATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ReporterType" AS ENUM ('CONSUMER', 'BUSINESS');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'UPHELD', 'REVIEW_ACTIONED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FlagType" AS ENUM ('IP_MATCH', 'DUPLICATE_TEXT', 'VELOCITY', 'NEW_ACCOUNT_EXTREME_RATING');

-- CreateEnum
CREATE TYPE "ModerationTarget" AS ENUM ('REVIEW', 'BUSINESS_RESPONSE', 'BUSINESS', 'USER');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('PUBLISH', 'SUSPEND', 'REMOVE', 'RESTORE', 'EDIT', 'MARK_UNDER_INVESTIGATION', 'CLEAR_INVESTIGATION', 'ACCEPT_EVIDENCE', 'REJECT_EVIDENCE', 'DISMISS_REPORT', 'ACTION_REPORT', 'START_DISPUTE_REVIEW', 'UPHOLD_REVIEW', 'ACTION_REVIEW', 'CLOSE_DISPUTE', 'NOINDEX_ON', 'NOINDEX_OFF');

-- CreateEnum
CREATE TYPE "PolicyReason" AS ENUM ('SPAM', 'FABRICATED_REVIEW', 'HARASSMENT', 'THREATS', 'HATE_SPEECH', 'IMPERSONATION', 'PERSONAL_INFORMATION', 'RATING_MANIPULATION', 'FAKE_EVIDENCE', 'CONFLICT_OF_INTEREST', 'DEFAMATORY_CONTENT', 'LEGAL_COMPLAINT', 'NO_VIOLATION', 'OTHER');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "NotificationEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "to" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'NG',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingDimension" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingDimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryDimension" (
    "categoryId" TEXT NOT NULL,
    "dimensionId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategoryDimension_pkey" PRIMARY KEY ("categoryId","dimensionId")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "cityId" TEXT,
    "area" TEXT,
    "onlineOnly" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT,
    "website" TEXT,
    "publicEmail" TEXT,
    "publicPhone" TEXT,
    "status" "BusinessStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "ownershipStatus" "OwnershipStatus" NOT NULL DEFAULT 'UNCLAIMED',
    "ownershipVerified" BOOLEAN NOT NULL DEFAULT false,
    "mergedIntoId" TEXT,
    "noindexOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdBySource" "ListingSource" NOT NULL DEFAULT 'ADMIN',
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "ratingAverage" DOUBLE PRECISION,
    "ratingDistribution" JSONB NOT NULL DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0}',
    "searchText" TEXT NOT NULL DEFAULT '',
    "searchVector" tsvector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessIdentifier" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSlugHistory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "oldSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessSlugHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSubmission" (
    "id" TEXT NOT NULL,
    "source" "ListingSource" NOT NULL,
    "submittedById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "cityId" TEXT,
    "area" TEXT,
    "onlineOnly" BOOLEAN NOT NULL DEFAULT false,
    "website" TEXT,
    "identifiers" JSONB NOT NULL DEFAULT '[]',
    "ownerRole" TEXT,
    "possibleDuplicateIds" TEXT[],
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "businessId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessClaim" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "method" "VerificationMethod" NOT NULL,
    "claimantRole" TEXT NOT NULL,
    "message" TEXT,
    "verificationTarget" TEXT,
    "verificationSecretHash" TEXT,
    "verificationExpiresAt" TIMESTAMP(3),
    "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
    "verificationConfirmedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pendingKey" TEXT,

    CONSTRAINT "BusinessClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimDocument" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessMember" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'OWNER',
    "claimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "BusinessMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recommend" BOOLEAN,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "evidenceAttached" BOOLEAN NOT NULL DEFAULT false,
    "evidenceStatus" "EvidenceStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "underInvestigation" BOOLEAN NOT NULL DEFAULT false,
    "resolutionStatus" "ResolutionStatus" NOT NULL DEFAULT 'NONE',
    "activeKey" TEXT,
    "deletedAt" TIMESTAMP(3),
    "editCount" INTEGER NOT NULL DEFAULT 0,
    "editedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "textHash" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDimensionRating" (
    "reviewId" TEXT NOT NULL,
    "dimensionId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "ReviewDimensionRating_pkey" PRIMARY KEY ("reviewId","dimensionId")
);

-- CreateTable
CREATE TABLE "ReviewRevision" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewEvidence" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessResponse" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ResponseStatus" NOT NULL DEFAULT 'PUBLISHED',
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessResponseRevision" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessResponseRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResolutionEvent" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "status" "ResolutionStatus" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResolutionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpfulVote" (
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpfulVote_pkey" PRIMARY KEY ("reviewId","userId")
);

-- CreateTable
CREATE TABLE "ReviewReport" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "responseId" TEXT,
    "reporterId" TEXT NOT NULL,
    "reporterType" "ReporterType" NOT NULL DEFAULT 'CONSUMER',
    "businessId" TEXT,
    "reasonCode" "ReportReason" NOT NULL,
    "note" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openKey" TEXT,

    CONSTRAINT "ReviewReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessDispute" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "decision" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "openKey" TEXT,

    CONSTRAINT "BusinessDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewFlag" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "type" "FlagType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "targetType" "ModerationTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" "ModerationActionType" NOT NULL,
    "reason" "PolicyReason",
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "reportId" TEXT,
    "disputeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationEmail_status_updatedAt_idx" ON "NotificationEmail"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RatingDimension_key_key" ON "RatingDimension"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE INDEX "Business_status_categoryId_idx" ON "Business"("status", "categoryId");

-- CreateIndex
CREATE INDEX "Business_status_cityId_idx" ON "Business"("status", "cityId");

-- CreateIndex
CREATE INDEX "Business_status_reviewCount_idx" ON "Business"("status", "reviewCount");

-- CreateIndex
CREATE INDEX "Business_status_ratingAverage_idx" ON "Business"("status", "ratingAverage");

-- CreateIndex
CREATE INDEX "Business_searchVector_idx" ON "Business" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Business_searchText_trgm_idx" ON "Business" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "BusinessIdentifier_type_normalizedValue_idx" ON "BusinessIdentifier"("type", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessIdentifier_businessId_type_normalizedValue_key" ON "BusinessIdentifier"("businessId", "type", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSlugHistory_oldSlug_key" ON "BusinessSlugHistory"("oldSlug");

-- CreateIndex
CREATE INDEX "BusinessSlugHistory_businessId_idx" ON "BusinessSlugHistory"("businessId");

-- CreateIndex
CREATE INDEX "BusinessSubmission_status_createdAt_idx" ON "BusinessSubmission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessSubmission_submittedById_idx" ON "BusinessSubmission"("submittedById");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessClaim_pendingKey_key" ON "BusinessClaim"("pendingKey");

-- CreateIndex
CREATE INDEX "BusinessClaim_status_createdAt_idx" ON "BusinessClaim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessClaim_businessId_idx" ON "BusinessClaim"("businessId");

-- CreateIndex
CREATE INDEX "BusinessClaim_userId_idx" ON "BusinessClaim"("userId");

-- CreateIndex
CREATE INDEX "ClaimDocument_claimId_idx" ON "ClaimDocument"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessMember_claimId_key" ON "BusinessMember"("claimId");

-- CreateIndex
CREATE INDEX "BusinessMember_userId_idx" ON "BusinessMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessMember_businessId_userId_key" ON "BusinessMember"("businessId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_activeKey_key" ON "Review"("activeKey");

-- CreateIndex
CREATE INDEX "Review_businessId_status_createdAt_idx" ON "Review"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Review_userId_createdAt_idx" ON "Review"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_status_createdAt_idx" ON "Review"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Review_textHash_idx" ON "Review"("textHash");

-- CreateIndex
CREATE INDEX "Review_ipHash_createdAt_idx" ON "Review"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewDimensionRating_dimensionId_idx" ON "ReviewDimensionRating"("dimensionId");

-- CreateIndex
CREATE INDEX "ReviewRevision_reviewId_idx" ON "ReviewRevision"("reviewId");

-- CreateIndex
CREATE INDEX "ReviewEvidence_reviewId_idx" ON "ReviewEvidence"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessResponse_reviewId_key" ON "BusinessResponse"("reviewId");

-- CreateIndex
CREATE INDEX "BusinessResponse_businessId_createdAt_idx" ON "BusinessResponse"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessResponseRevision_responseId_idx" ON "BusinessResponseRevision"("responseId");

-- CreateIndex
CREATE INDEX "ResolutionEvent_reviewId_createdAt_idx" ON "ResolutionEvent"("reviewId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewReport_openKey_key" ON "ReviewReport"("openKey");

-- CreateIndex
CREATE INDEX "ReviewReport_status_createdAt_idx" ON "ReviewReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewReport_reviewId_idx" ON "ReviewReport"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDispute_openKey_key" ON "BusinessDispute"("openKey");

-- CreateIndex
CREATE INDEX "BusinessDispute_status_createdAt_idx" ON "BusinessDispute"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessDispute_businessId_idx" ON "BusinessDispute"("businessId");

-- CreateIndex
CREATE INDEX "ReviewFlag_reviewId_idx" ON "ReviewFlag"("reviewId");

-- CreateIndex
CREATE INDEX "ModerationAction_targetType_targetId_idx" ON "ModerationAction"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ModerationAction_createdAt_idx" ON "ModerationAction"("createdAt");

-- AddForeignKey
ALTER TABLE "NotificationEmail" ADD CONSTRAINT "NotificationEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryDimension" ADD CONSTRAINT "CategoryDimension_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryDimension" ADD CONSTRAINT "CategoryDimension_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "RatingDimension"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessIdentifier" ADD CONSTRAINT "BusinessIdentifier_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSlugHistory" ADD CONSTRAINT "BusinessSlugHistory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSubmission" ADD CONSTRAINT "BusinessSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSubmission" ADD CONSTRAINT "BusinessSubmission_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSubmission" ADD CONSTRAINT "BusinessSubmission_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSubmission" ADD CONSTRAINT "BusinessSubmission_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessClaim" ADD CONSTRAINT "BusinessClaim_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessClaim" ADD CONSTRAINT "BusinessClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimDocument" ADD CONSTRAINT "ClaimDocument_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "BusinessClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMember" ADD CONSTRAINT "BusinessMember_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMember" ADD CONSTRAINT "BusinessMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMember" ADD CONSTRAINT "BusinessMember_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "BusinessClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDimensionRating" ADD CONSTRAINT "ReviewDimensionRating_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDimensionRating" ADD CONSTRAINT "ReviewDimensionRating_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "RatingDimension"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRevision" ADD CONSTRAINT "ReviewRevision_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvidence" ADD CONSTRAINT "ReviewEvidence_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessResponse" ADD CONSTRAINT "BusinessResponse_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessResponse" ADD CONSTRAINT "BusinessResponse_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessResponse" ADD CONSTRAINT "BusinessResponse_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessResponseRevision" ADD CONSTRAINT "BusinessResponseRevision_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "BusinessResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolutionEvent" ADD CONSTRAINT "ResolutionEvent_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpfulVote" ADD CONSTRAINT "HelpfulVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpfulVote" ADD CONSTRAINT "HelpfulVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "BusinessResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDispute" ADD CONSTRAINT "BusinessDispute_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDispute" ADD CONSTRAINT "BusinessDispute_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDispute" ADD CONSTRAINT "BusinessDispute_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewFlag" ADD CONSTRAINT "ReviewFlag_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Reference data. Launch categories (PRD §5); Hotels kept as an INACTIVE category.
INSERT INTO "Category" ("id", "slug", "name", "description", "active", "sortOrder", "updatedAt") VALUES
 (gen_random_uuid()::text, 'fashion-and-clothing', 'Fashion and clothing', 'Clothing, shoes, bags and accessories, including Instagram and online vendors.', true, 1, now()),
 (gen_random_uuid()::text, 'beauty-skincare-and-hair', 'Beauty, skincare and hair', 'Salons, barbers, make-up artists, skincare and hair products.', true, 2, now()),
 (gen_random_uuid()::text, 'electronics-and-gadgets', 'Electronics and gadgets', 'Phones, laptops, accessories, repairs and electronics retailers.', true, 3, now()),
 (gen_random_uuid()::text, 'food-and-restaurants', 'Food and restaurants', 'Restaurants, food vendors, caterers and bakeries.', true, 4, now()),
 (gen_random_uuid()::text, 'logistics-and-delivery', 'Logistics and delivery', 'Couriers, dispatch riders, haulage and delivery services.', true, 5, now()),
 (gen_random_uuid()::text, 'general-consumer-services', 'General consumer services', 'Other services consumers pay for, such as cleaning, repairs, events and printing.', true, 6, now()),
 (gen_random_uuid()::text, 'hotels-and-accommodation', 'Hotels and accommodation', 'Hotels, guest houses and short-let apartments. Not a launch category.', false, 7, now());

-- Rating dimensions from the PRD §7.6 initial guidance. The product owner can change them in the admin.
INSERT INTO "RatingDimension" ("id", "key", "label", "description") VALUES
 (gen_random_uuid()::text, 'product_quality', 'Product quality', 'Quality of the product received'),
 (gen_random_uuid()::text, 'product_authenticity', 'Product quality and authenticity', 'Whether the product was genuine and worked as described'),
 (gen_random_uuid()::text, 'sizing_fit', 'Sizing and fit', 'Whether sizes matched the description'),
 (gen_random_uuid()::text, 'service_quality', 'Service quality', 'Quality of the service received'),
 (gen_random_uuid()::text, 'food_quality', 'Food quality', 'Taste, freshness and portion of the food'),
 (gen_random_uuid()::text, 'hygiene_safety', 'Hygiene and safety', 'Cleanliness and safe handling'),
 (gen_random_uuid()::text, 'customer_service', 'Service', 'How the customer was treated'),
 (gen_random_uuid()::text, 'communication', 'Communication', 'Responsiveness and clarity'),
 (gen_random_uuid()::text, 'delivery', 'Delivery', 'Whether delivery happened as promised'),
 (gen_random_uuid()::text, 'delivery_reliability', 'Delivery reliability', 'Whether items arrived on time and as agreed'),
 (gen_random_uuid()::text, 'handling', 'Handling', 'Condition of items on arrival'),
 (gen_random_uuid()::text, 'after_sales_support', 'After-sales support', 'Warranty, returns and repairs after the purchase'),
 (gen_random_uuid()::text, 'reliability', 'Reliability', 'Whether the service happened as agreed'),
 (gen_random_uuid()::text, 'value_for_money', 'Value for money', 'Whether the experience justified the price');

-- (category, dimension, required, order). Only quality and value are required; the rest are
-- optional so nobody is forced to rate what did not apply (PRD §7.6).
INSERT INTO "CategoryDimension" ("categoryId", "dimensionId", "required", "order")
SELECT c."id", d."id", m.req, m.ord
FROM (VALUES
  ('fashion-and-clothing', 'product_quality', true, 1), ('fashion-and-clothing', 'sizing_fit', false, 2),
  ('fashion-and-clothing', 'delivery', false, 3), ('fashion-and-clothing', 'value_for_money', true, 4),
  ('beauty-skincare-and-hair', 'service_quality', true, 1), ('beauty-skincare-and-hair', 'product_quality', false, 2),
  ('beauty-skincare-and-hair', 'hygiene_safety', false, 3), ('beauty-skincare-and-hair', 'communication', false, 4),
  ('beauty-skincare-and-hair', 'value_for_money', true, 5),
  ('electronics-and-gadgets', 'product_authenticity', true, 1), ('electronics-and-gadgets', 'delivery', false, 2),
  ('electronics-and-gadgets', 'after_sales_support', false, 3), ('electronics-and-gadgets', 'value_for_money', true, 4),
  ('food-and-restaurants', 'food_quality', true, 1), ('food-and-restaurants', 'hygiene_safety', false, 2),
  ('food-and-restaurants', 'customer_service', false, 3), ('food-and-restaurants', 'delivery', false, 4),
  ('food-and-restaurants', 'value_for_money', true, 5),
  ('logistics-and-delivery', 'delivery_reliability', true, 1), ('logistics-and-delivery', 'handling', false, 2),
  ('logistics-and-delivery', 'communication', false, 3), ('logistics-and-delivery', 'value_for_money', true, 4),
  ('general-consumer-services', 'service_quality', true, 1), ('general-consumer-services', 'communication', false, 2),
  ('general-consumer-services', 'reliability', false, 3), ('general-consumer-services', 'value_for_money', true, 4),
  ('hotels-and-accommodation', 'service_quality', true, 1), ('hotels-and-accommodation', 'hygiene_safety', false, 2),
  ('hotels-and-accommodation', 'customer_service', false, 3), ('hotels-and-accommodation', 'value_for_money', true, 4)
) AS m(cat, dim, req, ord)
JOIN "Category" c ON c."slug" = m.cat
JOIN "RatingDimension" d ON d."key" = m.dim;

-- Launch cities (PRD "Migrating existing data"). Admins add more without a deploy.
INSERT INTO "City" ("id", "slug", "name", "state", "countryCode", "updatedAt") VALUES
 (gen_random_uuid()::text, 'lagos', 'Lagos', 'Lagos', 'NG', now()),
 (gen_random_uuid()::text, 'abuja', 'Abuja', 'Federal Capital Territory', 'NG', now());

-- 6. Weighted full-text vector (name = A, everything else = B), maintained by the database.
CREATE OR REPLACE FUNCTION business_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('simple', coalesce(NEW."name", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW."searchText", '')), 'B');
  RETURN NEW;
END
$$;

CREATE TRIGGER business_search_vector_trg
BEFORE INSERT OR UPDATE OF "name", "searchText" ON "Business"
FOR EACH ROW EXECUTE FUNCTION business_search_vector();
