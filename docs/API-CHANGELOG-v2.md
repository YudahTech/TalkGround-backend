# TalkGround API v2.0 — PRD rebuild (changelog & design record)

> **Superseded by [API-CHANGELOG-v2.5.md](./API-CHANGELOG-v2.5.md)** (PRD v2.5). Kept for history.

**Released:** 20 November 2026 · **Spec:** TalkGround PRD (MVP Specification) · **Migration:** `20261120120000_prd_rebuild`

v2.0 rebuilds the domain to match the PRD: a general business-reputation platform for Nigeria (6 expandable
categories, all states) with ownership claims, business responses, configurable rating dimensions, evidence
labels, disputes and a permission-based admin. Auth (HttpOnly cookies, rotating refresh tokens, lockout, audit)
carries over from v1.2 unchanged.

Frontend-facing changes: [FRONTEND-INTEGRATION.md §1](./FRONTEND-INTEGRATION.md#1-what-changed-from-v1).

---

## 1. PRD coverage

| PRD | Implementation |
|---|---|
| §6.1 Public discovery | `/businesses`, `/categories`, `/locations`, `/reviews/:id`, `/users/:username` are public |
| §6.2 Three listing channels | Staff create (`POST /admin/businesses`), consumer suggestion + owner submission (`POST /business-submissions`), all checked before publication |
| §6.3 Fairness | Businesses cannot delete reviews (disputes only), cannot review/vote on themselves, ratings ignore ownership/payment/responses |
| §6.4 Transparency | Four distinct review labels; separate ownership badge; "under investigation" for reviews and businesses |
| §7.1 Accounts & security | Unchanged v1.2 auth + export/deletion; public profile limited to chosen fields |
| §7.2 Search | Postgres full-text (weighted tsvector) + trigram; names, alt names, handles, websites, phones, CAC numbers, category, location; filters; 3 sorts |
| §7.3 Profiles & identifiers | `Business` + separate `BusinessIdentifier` (globally unique for handles/domains/phones/CAC) + `BusinessLocation` |
| §7.4 Lifecycle | `status` × `ownershipStatus` → derived `lifecycleStage` (8 PRD stages; "suggested" is a submission) |
| §7.5 Claims | 5 verification methods; email-code and DNS-TXT checks automated; documents private; staff decide |
| §7.6 Reviews | Category-configured dimensions; edit history (max 5 edits); repeat-experience rule; evidence |
| §7.7 Responses | One per review, attributed, max 3 edits with history, removable by moderators only |
| §7.8 Resolution | Business proposes; only the consumer resolves/reopens; full history; rating untouched |
| §7.9 Helpful votes | One active vote, changeable/removable, verified accounts, throttled, no self/own-business votes |
| §7.10–7.11 Dashboard & sharing | `/manage/businesses/:id/*` dashboard, inbox, profile, links, neutral share links |
| §7.12 Ratings | Single recompute path, versioned public methodology, 5-review threshold, no trust score |
| §8 Admin & moderation | 14 permissions in 4 seeded roles; queues; policy-grounded decisions (`ModerationAction`); disputes; append-only audit |
| §12 Entities | All 16 entities exist under the PRD names (plus support tables: memberships, revisions, events, flags, tokens) |
| §14 Security | Validation + sanitisation, parameterised SQL only, private uploads with signed URLs, rate limits, CSRF origin check, permission checks, audit |
| §17 Acceptance criteria | Covered by `apps/api/test/prd.e2e-spec.ts` (38 tests, see §6) |

---

## 2. Decisions

| Decision | Why | Alternative rejected |
|---|---|---|
| **Prisma, not TypeORM** (PRD §13 names TypeORM) | Prisma already met every requirement behind that line (Postgres, migrations, injection-safe queries); switching would rewrite the whole data layer and migration history for no functional gain. Agreed with the product owner on 20 Nov 2026. **Update PRD §13 accordingly.** | TypeORM rewrite |
| Categories, dimensions, staff roles are **rows** | PRD §5/§7.6/§8.1: expandable without releases | Enums |
| Status and ownership are **separate columns** | A suspended business can still be "verified"; one 8-value enum mixes two concerns | Single lifecycle enum |
| **Nullable unique keys** (`activeKey`, `uniqueKey`, `pendingKey`, `openKey`) | Enforce "one current review per person", "one listing per handle", "one open claim/report/dispute" in the database, race-free | Application-only checks |
| Ratings **recomputed**, never incremented | Acceptance criterion 13: always equal to a fresh calculation | Counters |
| Reports **do not auto-hide** reviews | PRD §8.2: a negative review must not disappear because it was reported | v1 behaviour (3 reports hid a review) |
| Fraud signals only **queue** for a human | Automated signals have false positives (shared CGNAT IPs in Nigeria) | Auto-reject |
| Owners cannot change **name/category** | Prevents rebranding away from reviews; staff can | Owner-editable |
| Claim approval is always a staff decision | PRD §7.5 step 5 | Auto-approve on email/DNS proof |
| Only email verification required | PRD names email verification; phone kept optional | v1 phone requirement |

---

## 3. Data migration

Applied automatically by Render (`prisma migrate deploy`). Agreed policy: **keep users, reset the catalogue**.

| Kept | Reset (dropped) | Converted |
|---|---|---|
| Users, sessions, password resets, OTPs, audit log, waitlist, survey | Brands, reviews and everything attached (media, votes, reports, flags, revisions), brand suggestions | `User.city` → `location`; `role` ADMIN → `super_admin`, MODERATOR → `moderator`; waitlist enums → text |

A JSON export of every production table taken just before deployment is in `backups/` on the deploying machine
(git-ignored; contains personal data — store securely, delete when no longer needed).

Reference data inserted by the migration: 6 categories, 5 rating dimensions with per-category required flags,
4 staff roles. Demo businesses come from `npm run db:seed` (fictional — **remove before public launch**).

---

## 4. Configuration

New optional env vars (defaults shown): `REVIEW_REQUIRE_EMAIL_VERIFIED=true`, `REVIEW_REPEAT_AFTER_DAYS=90`,
`REVIEW_MAX_EDITS=5`, `REVIEW_DAILY_LIMIT=3`. `REVIEW_REQUIRE_PHONE_VERIFIED` is no longer read.
`FRONTEND_URL` is used for share links and notification emails — set it on Render.

Postgres extension `pg_trgm` is created by the migration (available on Neon).

---

## 5. Known limits

- Rate limiting is in-memory (single instance). Move to Redis before running more than one API instance.
- Notification emails need Brevo (`BREVO_API_KEY`, `EMAIL_FROM`); without them they are logged, not sent.
- Evidence and claim documents need Cloudinary; without it those endpoints return `503`.
- Social-account claims are checked by staff manually (Instagram/TikTok don't offer a reliable public check).
- Search is Postgres-only; fine for tens of thousands of listings. Revisit beyond that (PRD §13).
- No public rankings (excluded from MVP by the PRD).

---

## 6. Tests

```bash
# Postgres on localhost with an empty database named *_test (the suite resets it)
cd apps/api
DATABASE_URL=postgresql://postgres:postgres@localhost:5544/talkground_test npm run test:e2e
```

`test/prd.e2e-spec.ts` boots the real app (same middleware as production) and drives it through cookie-based
clients. It covers the PRD acceptance criteria: accounts/auth, public discovery + ratings + insufficient data,
submissions, duplicate detection + merge, dimensions + edits + votes, rating consistency, claims (manual and
email-domain), owner portal + responses + resolution, conflicts of interest, reports, disputes, moderation,
suspension, permissions, audit trail, export and deletion. The suite refuses to run against a non-local or
non-`_test` database.
