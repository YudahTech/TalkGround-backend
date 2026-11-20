-- TalkGround PRD rebuild (data model of PRD §12).
--
-- Agreed data policy: user accounts, sessions, audit history and the pre-launch waitlist/survey
-- are KEPT. The old restaurants/hotels catalogue and its reviews are RESET: they do not fit the
-- new category, lifecycle and review model.
--
-- Order: preserve user data -> drop old domain -> create new domain -> reference data ->
-- move staff roles -> drop retired columns/types -> search trigger.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. Keep the location users chose to show; add the staff-role link.
ALTER TABLE "User" ADD COLUMN "location" TEXT, ADD COLUMN "adminRoleId" TEXT;
UPDATE "User" SET "location" = CASE "city"::text WHEN 'LAGOS' THEN 'Lagos' WHEN 'ABUJA' THEN 'Abuja' END
WHERE "city" IS NOT NULL;

-- 2. Waitlist: enum columns become plain text (values kept, lowercased).
ALTER TABLE "WaitlistEntry"
  ALTER COLUMN "city" TYPE TEXT USING lower("city"::text),
  ALTER COLUMN "primaryUse" TYPE TEXT USING lower("primaryUse"::text);

-- 3. Retire the old catalogue and review domain.
DROP TABLE IF EXISTS "ReviewHelpfulVote", "ReviewMedia", "ReviewFlag", "ReviewReport",
  "ReviewRevision", "Review", "BrandSuggestion", "Brand" CASCADE;
DROP TYPE IF EXISTS "ReviewStatus", "MediaType", "FlagType", "ReportReason", "ReportStatus",
  "SuggestionStatus", "BrandCategory", "BrandStatus", "RestaurantSubType", "HotelSubType";

-- 4. New domain (generated from schema.prisma).

-- CreateEnum
CREATE TYPE "AdminPermission" AS ENUM ('USERS_VIEW', 'USERS_RESTRICT', 'STAFF_MANAGE', 'BUSINESSES_MANAGE', 'BUSINESSES_MERGE', 'SUBMISSIONS_REVIEW', 'CLAIMS_REVIEW', 'CLAIM_DOCUMENTS_VIEW', 'REVIEWS_MODERATE', 'EVIDENCE_REVIEW', 'REPORTS_MANAGE', 'DISPUTES_MANAGE', 'TAXONOMY_MANAGE', 'AUDIT_VIEW');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('PENDING_REVIEW', 'PUBLISHED', 'SUSPENDED', 'MERGED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OwnershipStatus" AS ENUM ('UNCLAIMED', 'CLAIM_PENDING', 'CLAIMED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "BusinessSource" AS ENUM ('ADMIN', 'CONSUMER_SUGGESTION', 'OWNER_SUBMISSION');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'X', 'WHATSAPP', 'WEBSITE', 'PHONE', 'EMAIL', 'ALTERNATIVE_NAME', 'CAC_NUMBER', 'OTHER');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('ADDRESS', 'SERVICE_AREA');

-- CreateEnum
CREATE TYPE "SubmissionSource" AS ENUM ('CONSUMER_SUGGESTION', 'OWNER_SUBMISSION');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('BUSINESS_EMAIL', 'WEBSITE_DOMAIN', 'SOCIAL_ACCOUNT', 'DOCUMENTS', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_MODERATION', 'PUBLISHED', 'UNDER_INVESTIGATION', 'REMOVED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('PHOTO', 'RECEIPT', 'SCREENSHOT', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('NOT_REVIEWED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('NONE', 'BUSINESS_RESPONDED', 'RESOLUTION_PROPOSED', 'RESOLVED_BY_CONSUMER', 'DISPUTE_REOPENED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('CONSUMER', 'BUSINESS', 'SYSTEM', 'STAFF');

-- CreateEnum
CREATE TYPE "VoteValue" AS ENUM ('HELPFUL', 'NOT_HELPFUL');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('PUBLISHED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('FALSE_EXPERIENCE', 'SPAM_PROMOTIONAL', 'PERSONAL_INFORMATION', 'HARASSMENT_ABUSE', 'CONFLICT_OF_INTEREST', 'IMPERSONATION', 'OTHER_POLICY_VIOLATION');

-- CreateEnum
CREATE TYPE "ReporterType" AS ENUM ('CONSUMER', 'BUSINESS');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UPHELD', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "FlagType" AS ENUM ('IP_MATCH', 'DUPLICATE_TEXT', 'VELOCITY', 'NEW_ACCOUNT_LOW_RATING', 'BUSINESS_MEMBER');

-- CreateEnum
CREATE TYPE "ModerationTarget" AS ENUM ('REVIEW', 'BUSINESS_RESPONSE', 'EVIDENCE', 'BUSINESS', 'USER');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('PUBLISH', 'REMOVE', 'RESTORE', 'MARK_UNDER_INVESTIGATION', 'CLEAR_INVESTIGATION', 'ACCEPT_EVIDENCE', 'REJECT_EVIDENCE', 'DISMISS_REPORT', 'ACTION_REPORT', 'UPHOLD_DISPUTE', 'REJECT_DISPUTE', 'SUSPEND', 'UNSUSPEND');

-- CreateEnum
CREATE TYPE "PolicyReason" AS ENUM ('SPAM', 'FABRICATED_REVIEW', 'HARASSMENT', 'THREATS', 'HATE_SPEECH', 'IMPERSONATION', 'PERSONAL_INFORMATION', 'MANIPULATED_RATINGS', 'FAKE_EVIDENCE', 'CONFLICT_OF_INTEREST', 'DEFAMATORY_OR_UNLAWFUL', 'NO_VIOLATION', 'OTHER');

-- CreateTable
CREATE TABLE "AdminRole" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" "AdminPermission"[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingDimension" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingDimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryDimension" (
    "categoryId" TEXT NOT NULL,
    "dimensionId" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategoryDimension_pkey" PRIMARY KEY ("categoryId","dimensionId")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "website" TEXT,
    "publicEmail" TEXT,
    "publicPhone" TEXT,
    "categoryId" TEXT NOT NULL,
    "status" "BusinessStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "ownershipStatus" "OwnershipStatus" NOT NULL DEFAULT 'UNCLAIMED',
    "source" "BusinessSource" NOT NULL DEFAULT 'ADMIN',
    "underInvestigation" BOOLEAN NOT NULL DEFAULT false,
    "investigationNote" TEXT,
    "mergedIntoId" TEXT,
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
    "uniqueKey" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessLocation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'ADDRESS',
    "addressLine" TEXT,
    "area" TEXT,
    "city" TEXT,
    "state" TEXT,
    "nationwide" BOOLEAN NOT NULL DEFAULT false,
    "countryCode" TEXT NOT NULL DEFAULT 'NG',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSubmission" (
    "id" TEXT NOT NULL,
    "source" "SubmissionSource" NOT NULL,
    "submittedById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "website" TEXT,
    "state" TEXT,
    "city" TEXT,
    "area" TEXT,
    "addressLine" TEXT,
    "identifiers" JSONB NOT NULL DEFAULT '[]',
    "ownerRole" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewNote" TEXT,
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
    "claimantId" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "method" "VerificationMethod" NOT NULL,
    "claimantRole" TEXT NOT NULL,
    "message" TEXT,
    "verificationTarget" TEXT,
    "verificationSecretHash" TEXT,
    "verificationExpiresAt" TIMESTAMP(3),
    "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
    "verificationConfirmedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
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
    "title" TEXT,
    "body" TEXT NOT NULL,
    "experienceDate" TIMESTAMP(3),
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "supersededAt" TIMESTAMP(3),
    "activeKey" TEXT,
    "resolutionStatus" "ResolutionStatus" NOT NULL DEFAULT 'NONE',
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
CREATE TABLE "ReviewDimension" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "dimensionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "ReviewDimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRevision" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "experienceDate" TIMESTAMP(3),
    "dimensions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewEvidence" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
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
    "editCount" INTEGER NOT NULL DEFAULT 0,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseRevision" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResponseRevision_pkey" PRIMARY KEY ("id")
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
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" "VoteValue" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpfulVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewReport" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reporterType" "ReporterType" NOT NULL DEFAULT 'CONSUMER',
    "businessId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
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
    "raisedById" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
CREATE INDEX "User_adminRoleId_idx" ON "User"("adminRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRole_key_key" ON "AdminRole"("key");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessCategory_slug_key" ON "BusinessCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RatingDimension_key_key" ON "RatingDimension"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE INDEX "Business_status_categoryId_idx" ON "Business"("status", "categoryId");

-- CreateIndex
CREATE INDEX "Business_status_reviewCount_idx" ON "Business"("status", "reviewCount");

-- CreateIndex
CREATE INDEX "Business_status_ratingAverage_idx" ON "Business"("status", "ratingAverage");

-- CreateIndex
CREATE INDEX "Business_searchVector_idx" ON "Business" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Business_searchText_trgm_idx" ON "Business" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessIdentifier_uniqueKey_key" ON "BusinessIdentifier"("uniqueKey");

-- CreateIndex
CREATE INDEX "BusinessIdentifier_businessId_idx" ON "BusinessIdentifier"("businessId");

-- CreateIndex
CREATE INDEX "BusinessIdentifier_type_normalizedValue_idx" ON "BusinessIdentifier"("type", "normalizedValue");

-- CreateIndex
CREATE INDEX "BusinessLocation_businessId_idx" ON "BusinessLocation"("businessId");

-- CreateIndex
CREATE INDEX "BusinessLocation_state_city_idx" ON "BusinessLocation"("state", "city");

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
CREATE INDEX "BusinessClaim_claimantId_idx" ON "BusinessClaim"("claimantId");

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
CREATE INDEX "ReviewDimension_dimensionId_idx" ON "ReviewDimension"("dimensionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewDimension_reviewId_dimensionId_key" ON "ReviewDimension"("reviewId", "dimensionId");

-- CreateIndex
CREATE INDEX "ReviewRevision_reviewId_idx" ON "ReviewRevision"("reviewId");

-- CreateIndex
CREATE INDEX "ReviewEvidence_reviewId_idx" ON "ReviewEvidence"("reviewId");

-- CreateIndex
CREATE INDEX "ReviewEvidence_status_createdAt_idx" ON "ReviewEvidence"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessResponse_reviewId_key" ON "BusinessResponse"("reviewId");

-- CreateIndex
CREATE INDEX "BusinessResponse_businessId_createdAt_idx" ON "BusinessResponse"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "ResponseRevision_responseId_idx" ON "ResponseRevision"("responseId");

-- CreateIndex
CREATE INDEX "ResolutionEvent_reviewId_createdAt_idx" ON "ResolutionEvent"("reviewId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HelpfulVote_reviewId_userId_key" ON "HelpfulVote"("reviewId", "userId");

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
ALTER TABLE "User" ADD CONSTRAINT "User_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "AdminRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryDimension" ADD CONSTRAINT "CategoryDimension_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BusinessCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryDimension" ADD CONSTRAINT "CategoryDimension_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "RatingDimension"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BusinessCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessIdentifier" ADD CONSTRAINT "BusinessIdentifier_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessLocation" ADD CONSTRAINT "BusinessLocation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSubmission" ADD CONSTRAINT "BusinessSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSubmission" ADD CONSTRAINT "BusinessSubmission_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BusinessCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSubmission" ADD CONSTRAINT "BusinessSubmission_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessClaim" ADD CONSTRAINT "BusinessClaim_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessClaim" ADD CONSTRAINT "BusinessClaim_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "ReviewDimension" ADD CONSTRAINT "ReviewDimension_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDimension" ADD CONSTRAINT "ReviewDimension_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "RatingDimension"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "ResponseRevision" ADD CONSTRAINT "ResponseRevision_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "BusinessResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolutionEvent" ADD CONSTRAINT "ResolutionEvent_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpfulVote" ADD CONSTRAINT "HelpfulVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpfulVote" ADD CONSTRAINT "HelpfulVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDispute" ADD CONSTRAINT "BusinessDispute_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDispute" ADD CONSTRAINT "BusinessDispute_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDispute" ADD CONSTRAINT "BusinessDispute_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewFlag" ADD CONSTRAINT "ReviewFlag_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Reference data. Categories (PRD §5), rating dimensions (PRD §7.6) and staff roles (PRD §8.1)
-- are rows, so adding one never needs a schema change.
INSERT INTO "AdminRole" ("id", "key", "name", "description", "permissions", "isSystem", "updatedAt") VALUES
 (gen_random_uuid()::text, 'super_admin', 'Super admin', 'Every permission, including staff management.',
  ARRAY['USERS_VIEW','USERS_RESTRICT','STAFF_MANAGE','BUSINESSES_MANAGE','BUSINESSES_MERGE','SUBMISSIONS_REVIEW','CLAIMS_REVIEW','CLAIM_DOCUMENTS_VIEW','REVIEWS_MODERATE','EVIDENCE_REVIEW','REPORTS_MANAGE','DISPUTES_MANAGE','TAXONOMY_MANAGE','AUDIT_VIEW']::"AdminPermission"[], true, now()),
 (gen_random_uuid()::text, 'moderator', 'Moderator', 'Reviews, evidence, reports, disputes and business submissions.',
  ARRAY['USERS_VIEW','REVIEWS_MODERATE','EVIDENCE_REVIEW','REPORTS_MANAGE','DISPUTES_MANAGE','SUBMISSIONS_REVIEW']::"AdminPermission"[], true, now()),
 (gen_random_uuid()::text, 'listings_manager', 'Listings manager', 'Business listings, duplicates, submissions and ownership claims, including private claim documents.',
  ARRAY['BUSINESSES_MANAGE','BUSINESSES_MERGE','SUBMISSIONS_REVIEW','CLAIMS_REVIEW','CLAIM_DOCUMENTS_VIEW']::"AdminPermission"[], true, now()),
 (gen_random_uuid()::text, 'support', 'Support', 'Look up users and restrict abusive accounts.',
  ARRAY['USERS_VIEW','USERS_RESTRICT']::"AdminPermission"[], true, now());

INSERT INTO "BusinessCategory" ("id", "slug", "name", "description", "sortOrder", "updatedAt") VALUES
 (gen_random_uuid()::text, 'fashion-clothing', 'Fashion & Clothing', 'Clothing, shoes, bags and accessories, including Instagram and online vendors.', 1, now()),
 (gen_random_uuid()::text, 'beauty-skincare-hair', 'Beauty, Skincare & Hair', 'Salons, barbers, make-up artists, skincare and hair products.', 2, now()),
 (gen_random_uuid()::text, 'electronics-gadgets', 'Electronics & Gadgets', 'Phones, laptops, accessories, repairs and electronics retailers.', 3, now()),
 (gen_random_uuid()::text, 'food-restaurants', 'Food & Restaurants', 'Restaurants, food vendors, caterers and bakeries.', 4, now()),
 (gen_random_uuid()::text, 'logistics-delivery', 'Logistics & Delivery', 'Couriers, dispatch riders, haulage and delivery services.', 5, now()),
 (gen_random_uuid()::text, 'general-services', 'General Consumer Services', 'Other services consumers pay for, such as cleaning, repairs, events and printing.', 6, now());

INSERT INTO "RatingDimension" ("id", "key", "name", "description") VALUES
 (gen_random_uuid()::text, 'product_service_quality', 'Product/Service Quality', 'Quality of the product or service received'),
 (gen_random_uuid()::text, 'delivery_punctuality', 'Delivery/Punctuality', 'Whether delivery or service happened as expected'),
 (gen_random_uuid()::text, 'communication', 'Communication', 'Responsiveness and clarity'),
 (gen_random_uuid()::text, 'customer_service', 'Customer Service', 'How the customer was treated'),
 (gen_random_uuid()::text, 'value_for_money', 'Value for Money', 'Whether the experience justified the price');

-- (category, dimension, required, order). Delivery is never required where it may not apply (PRD §7.6).
INSERT INTO "CategoryDimension" ("categoryId", "dimensionId", "isRequired", "sortOrder")
SELECT c.id, d.id, m.req, m.ord
FROM (VALUES
  ('fashion-clothing', 'product_service_quality', true, 1), ('fashion-clothing', 'delivery_punctuality', false, 2),
  ('fashion-clothing', 'communication', false, 3), ('fashion-clothing', 'customer_service', false, 4), ('fashion-clothing', 'value_for_money', true, 5),
  ('beauty-skincare-hair', 'product_service_quality', true, 1), ('beauty-skincare-hair', 'delivery_punctuality', false, 2),
  ('beauty-skincare-hair', 'communication', false, 3), ('beauty-skincare-hair', 'customer_service', true, 4), ('beauty-skincare-hair', 'value_for_money', true, 5),
  ('electronics-gadgets', 'product_service_quality', true, 1), ('electronics-gadgets', 'delivery_punctuality', false, 2),
  ('electronics-gadgets', 'communication', false, 3), ('electronics-gadgets', 'customer_service', true, 4), ('electronics-gadgets', 'value_for_money', true, 5),
  ('food-restaurants', 'product_service_quality', true, 1), ('food-restaurants', 'delivery_punctuality', false, 2),
  ('food-restaurants', 'communication', false, 3), ('food-restaurants', 'customer_service', true, 4), ('food-restaurants', 'value_for_money', true, 5),
  ('logistics-delivery', 'product_service_quality', false, 1), ('logistics-delivery', 'delivery_punctuality', true, 2),
  ('logistics-delivery', 'communication', true, 3), ('logistics-delivery', 'customer_service', true, 4), ('logistics-delivery', 'value_for_money', true, 5),
  ('general-services', 'product_service_quality', true, 1), ('general-services', 'delivery_punctuality', false, 2),
  ('general-services', 'communication', false, 3), ('general-services', 'customer_service', true, 4), ('general-services', 'value_for_money', true, 5)
) AS m(cat, dim, req, ord)
JOIN "BusinessCategory" c ON c.slug = m.cat
JOIN "RatingDimension" d ON d.key = m.dim;

-- 6. Staff: ADMIN -> super_admin, MODERATOR -> moderator. Ordinary users get no staff role.
UPDATE "User" SET "adminRoleId" = (SELECT id FROM "AdminRole" WHERE key = 'super_admin') WHERE "role"::text = 'ADMIN';
UPDATE "User" SET "adminRoleId" = (SELECT id FROM "AdminRole" WHERE key = 'moderator') WHERE "role"::text = 'MODERATOR';

-- 7. Retire columns and types that only served the old model.
ALTER TABLE "User" DROP COLUMN "city", DROP COLUMN "interests", DROP COLUMN "role";
DROP TYPE IF EXISTS "City", "ReviewInterest", "UserRole", "PrimaryUse";

-- 8. Weighted full-text vector (name = A, everything else = B), maintained by the database.
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
