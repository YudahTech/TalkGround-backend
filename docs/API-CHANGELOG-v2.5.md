# TalkGround API 2.5 — PRD v2.5 alignment (changelog & design record)

**Released:** 21 November 2026 · **Spec:** TalkGround PRD v2.5 (final MVP specification)
**Migration:** `20261121090000_prd_v2_5` · **Previous:** [API-CHANGELOG-v2.md](./API-CHANGELOG-v2.md) (superseded)

Frontend-facing summary: [FRONTEND-INTEGRATION.md §1](./FRONTEND-INTEGRATION.md#1-what-changed-from-api-20).

---

## 1. §19 acceptance criteria — status

| Criterion | Status | Where / how |
|---|---|---|
| No legacy product name or "brand" strings in API, database, emails or docs | ✅ backend · ⚠️ infra | Code, seed, Swagger and docs scrubbed (tested). The **staging host name** still contains it — rename the Render service or move to the custom domain. |
| Categories and cities are database records, managed without a deploy | ✅ | `Category`, `City` tables; `POST/PATCH /admin/categories`, `/admin/cities` (`category.manage`) |
| Per-category dimension ratings | ✅ | `RatingDimension`, `CategoryDimension (required, order)`, `ReviewDimensionRating` |
| Multiple identifiers; search finds them | ✅ | `BusinessIdentifier`; full-text + trigram; exact phone match |
| Consumer and owner submissions show possible duplicates | ✅ | `possibleMatches` to the submitter, `possibleDuplicateIds` + live candidates to staff |
| Admins approve, reject, suspend, merge | ✅ | §7.4 transition table enforced; merge moves reviews |
| Claims with approve/reject + reason | ✅ | 5 methods incl. social account for Instagram-only vendors |
| Owners edit permitted fields, see dashboard | ✅ | `/manage/businesses/:id/*` |
| Only members respond; no deletion/hiding of reviews | ✅ | membership checked server-side on every route |
| Only the reviewer marks a complaint resolved | ✅ | |
| Disputes preserve the original | ✅ | OPEN → UNDER_REVIEW → UPHELD / REVIEW_ACTIONED / CLOSED |
| Five labels are separate fields | ✅ | `emailVerified`, `evidenceAttached`, `evidenceStatus`, `underInvestigation`, `ownershipVerified` |
| Ratings use only published reviews; counts; insufficient-data state | ✅ | minimum 3 (config), "Not enough reviews yet" |
| No claimed/verified bonus, no hidden trust score | ✅ | ratings never read ownership; trust score removed in 2.0 |
| Helpful votes cannot be repeated | ✅ | primary key `(reviewId, userId)`, toggle |
| Sensitive actions audit-logged (actor, target, time, before/after, reason) | ✅ | append-only `AuditLog`; CSV export |
| Permissions enforced per permission | ✅ | PRD §9 keys and default role mapping |
| Private documents not public | ✅ | `type=authenticated` uploads; 10-minute signed URLs; viewing audited |
| No demo credentials in production or public docs | ✅ backend · ⚠️ ops | Swagger/docs scrubbed; seed refuses `NODE_ENV=production`, generates passwords; production admin via `npm run admin:create` |
| Access tokens ≤ 15 minutes | ✅ | hard cap in code regardless of `JWT_EXPIRES_IN` |
| Custom domains, Safari/iPhone test | ⏳ ops + frontend | launch blocker (PRD §14) |
| Privacy policy, terms, moderation policy published | ⏳ product | |
| Public pages render without JavaScript | ⏳ frontend | backend provides SSR-ready payloads |
| `/b/{slug}`, 301 on slug change, slugs never reused | ✅ backend · ⏳ frontend | `BusinessSlugHistory`; `kind: redirect` |
| Indexing follows the status table; thin pages noindex | ✅ backend · ⏳ frontend | `data.seo.robots`; `noindexOverride` |
| Sitemap only indexable pages; robots.txt blocks private paths | ✅ data · ⏳ frontend | `GET /seo/sitemap` |
| Unique titles/descriptions/canonicals; WhatsApp preview | ✅ data · ⏳ frontend | `data.seo` |
| Structured data matches visible content | ✅ | `aggregateRating` only when displayed |
| Removed content disappears within 15 minutes | ✅ backend · ⏳ frontend | `s-maxage=900`; signed on-demand revalidation webhook |
| Claim/verification/payment never affect indexing or ranking | ✅ | indexable rule and search order ignore them |
| Search Console verified, sitemap submitted | ⏳ ops | |
| §7.14 emails tested for the specified events | ✅ backend | `NotificationEmail` log with status + automatic retry; needs Brevo configured to actually send |
| Moderation, defamation and appeals procedures published | ⏳ product | |
| Final name and domain confirmed | ⏳ product | |

---

## 2. What changed (API 2.0 → 2.5)

**Data model (PRD §13 names):** `Category` (+ `parentId`, `active`), `City`, `RatingDimension.label`,
`CategoryDimension (required, order)`, `ReviewDimensionRating (value)`, `BusinessSlugHistory`,
`BusinessResponseRevision`, `NotificationEmail`. `Business` gains `cityId`, `area`, `onlineOnly`,
`ownershipVerified`, `noindexOverride`, `createdBySource`; ownership is `UNCLAIMED | CLAIM_PENDING | CLAIMED`;
status adds `SUGGESTED`, `REJECTED`. `Review` gains `title` (required), `recommend`, `evidenceAttached`,
`evidenceStatus`, `underInvestigation`, `deletedAt`; statuses `PENDING | PUBLISHED | UNDER_INVESTIGATION |
SUSPENDED | REMOVED`. `HelpfulVote` is `(reviewId, userId)`. Disputes take a written reason. `AuditLog` gains
`before`, `after`, `reason`. Staff permissions are PRD §9 strings.

**Rules:** minimum reviews 3; one active review per business (repeat = update; no edit cap); body ≥ 50; phone
verification off by default; identifiers are duplicate signals only (no global uniqueness); slugs generated
(area added on conflict) with permanent redirects; §7.4 transitions enforced; reports and disputes set
`underInvestigation`; only the §7.14 emails are sent.

**Removed from 2.0:** `/locations`, vote down/remove endpoints, claim cancel, business-level "under
investigation", edit caps on reviews and responses, the 90-day repeat-review rule, auto-rejection of
submissions that share an identifier.

---

## 3. Decisions to confirm with the product owner (PRD §0.4)

| # | Decision | Why | Alternative |
|---|---|---|---|
| 1 | Data layer is **Prisma** (PRD v2.5 §14 only requires PostgreSQL + migrations) | Already in place, migration history intact | — (no longer a deviation) |
| 2 | Staging business data was **reset and reseeded** (accounts, audit, waitlist kept) | Staging held only generated demo data; converting it field by field added risk for no value | Field-by-field conversion |
| 3 | `underInvestigation` turns on as soon as **any** report is opened (PRD §6.4 definition) | Literal PRD rule | Only when a moderator investigates — prevents a business from labelling every negative review by reporting it. **Recommend reviewing this rule.** |
| 4 | A moderator-set `UNDER_INVESTIGATION` **status** removes the review from the rating; an open report or dispute does not | §7.12 "average of PUBLISHED reviews" | Keep investigated reviews in the rating |
| 5 | City changes are audit-logged with target type `category` | §8.5 list has no `city` type | Add `city` to the list |
| 6 | Email delivery log and retry sit under `user.suspend` (Admin+) | §7.14 needs a retry path; §9 has no specific permission | A new permission |
| 7 | Moderator "force noindex" uses `review.moderate` | §7.13 says "a moderator can force noindex" | A new permission |
| 8 | Pre-launch **waitlist and survey** endpoints remain (not in PRD scope) | Existing data from before the PRD | Remove them before launch |
| 9 | Dimensions per category follow the §7.6 initial guidance, with quality + value required and the rest optional | §7.6 "do not force irrelevant dimensions" | The product owner adjusts them in the admin (no deploy) |

---

## 4. Internal trust checks (PRD §12.2 — documented as required)

They **only** decide whether a new or edited review goes to the moderation queue (`PENDING`) instead of being
published straight away. They never change ratings, ranking, labels or what is shown, and there is no score.

| Signal | Condition | Effect |
|---|---|---|
| `DUPLICATE_TEXT` | Identical normalised text to another review | Hold for a moderator |
| `IP_MATCH` | 2+ other accounts reviewed the same business from the same (hashed) IP in 30 days | Hold (shared mobile IPs make 1 match normal) |
| `VELOCITY` | 5+ reviews of the business in the last hour | Hold |
| `NEW_ACCOUNT_EXTREME_RATING` | 1- or 5-star review from an account under 24 h old | Recorded for moderators only; review still published |

---

## 5. Configuration (PRD "Config flags")

| Env var | Default | |
|---|---|---|
| `REQUIRE_PHONE_VERIFIED_FOR_REVIEWS` | `false` | §7.1 |
| `JWT_EXPIRES_IN` | `15m` | capped at 15 minutes in code |
| `MIN_REVIEWS_FOR_RATING` | `3` | §7.12 |
| `REVIEW_DAILY_LIMIT` | `3` | §7.6 |
| `REVIEW_BODY_MIN_LENGTH` | `50` | §7.6 |
| `INDEXABLE_MIN_DESCRIPTION_CHARS` | `80` | §7.13 |
| `INDEXABLE_MIN_REVIEWS` | `0` | §7.13 |
| `INDEXABLE_MIN_LISTINGS` | `5` | §7.13 |
| `PUBLIC_CACHE_MAX_MINUTES` | `15` | §7.13 |
| `FRONTEND_URL` | — | canonical URLs, share links, emails |
| `FRONTEND_REVALIDATE_URL`, `REVALIDATE_SECRET` | — | on-demand revalidation webhook (optional) |

Threshold changes require an approved PRD change (§7.13), not ad-hoc edits.

---

## 6. Operations

- **Production admin (one-time, §15):** `ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_USERNAME=… npm run admin:create` —
  prints a generated password once. Never run the seed in production (it refuses).
- **Staging demo data:** `npm run db:seed` (local `.env` pointing at staging). Generated passwords are printed
  once; `SEED_RESET_PASSWORDS=true` rotates them.
- **Tests:** `DATABASE_URL=postgresql://…/talkground_test npm run test:e2e` (resets that database; refuses any
  non-local or non-`_test` database). 47 tests cover §19, the §0.3 definition of done and Swagger completeness.
- **Backups:** JSON exports taken before each destructive migration are in `backups/` (git-ignored, contain personal
  data). Neon point-in-time restore should also be enabled and tested (§15).
