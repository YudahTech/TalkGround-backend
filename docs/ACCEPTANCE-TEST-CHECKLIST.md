# TalkGround — Acceptance Test Checklist

Use this before soft launch and public launch. Mark each item Pass / Fail / N/A.

**Tester:** _______________  
**Date:** _______________  
**Environment:** Staging / Production

---

## Public pages

| # | Test | Steps | Expected | Pass? |
|---|---|---|---|---|
| P-01 | Home loads | Visit `/` | Hero, search, featured brands, CTAs visible | |
| P-02 | Search works | Search "Jollof" on home | Redirects to `/brands?q=Jollof` with results | |
| P-03 | Brand listing | Visit `/brands` | Brands displayed with rating + count | |
| P-04 | City filter | Filter Lagos on `/brands` | Only Lagos brands shown | |
| P-05 | Brand detail | Visit `/brand/jollof-palace` | Name, rating, breakdown, reviews, write CTA | |
| P-06 | Category restaurants | Visit `/category/restaurants` | Restaurant brands listed | |
| P-07 | Category hotels | Visit `/category/hotels` | Hotel brands listed | |
| P-08 | Empty search | Search "zzzznonexistent" | Empty state with suggest brand link | |

---

## Survey & waitlist

| # | Test | Steps | Expected | Pass? |
|---|---|---|---|---|
| G-01 | Survey screening | Answer "No" to age question | Survey ends gracefully | |
| G-02 | Survey complete | Complete full survey | Thank you screen; data in DB | |
| G-03 | Survey email opt-in | Opt in with email at end | Email saved with response | |
| G-04 | Waitlist submit | Fill all required fields + consent | "You're on the list" success screen | |
| G-05 | Duplicate waitlist | Submit same email twice | Error: already on waitlist | |

---

## Authentication

| # | Test | Steps | Expected | Pass? |
|---|---|---|---|---|
| A-01 | Register | Create account with valid data | Logged in; redirected | |
| A-02 | Duplicate email | Register with existing email | Error message | |
| A-03 | Login | Login with valid credentials | JWT stored; navbar updates | |
| A-04 | Bad password | Login with wrong password | Error message | |
| A-05 | Forgot password | Submit email on forgot page | Success message (no leak) | |
| A-06 | Phone OTP send | Click send OTP after register | OTP received (SMS or console) | |
| A-07 | Phone OTP confirm | Enter correct OTP | phoneVerified = true | |

---

## Reviews

| # | Test | Steps | Expected | Pass? |
|---|---|---|---|---|
| R-01 | Gate: not logged in | Visit `/review/jollof-palace` logged out | Redirect to login | |
| R-02 | Gate: unverified | Try review without phone verify | Verification prompt shown | |
| R-03 | Write review | Submit valid review (50+ chars) | Review appears on brand page | |
| R-04 | Min length | Submit review <50 chars | Validation error | |
| R-05 | Duplicate review | Submit second review same brand | Error: already reviewed | |
| R-06 | Photo upload | Attach 1–3 photos | Photos visible on review card | |
| R-07 | Receipt upload | Attach receipt | Status pending_verification; no public receipt | |
| R-08 | Edit review | Edit from `/dashboard/reviews` | Updated content; edited date shown | |
| R-09 | Delete review | Delete own review | Removed from public view | |
| R-10 | Report review | Report another user's review | Report appears in admin queue | |
| R-11 | Rate limit | Submit 4 reviews in 24h | 4th blocked | |

---

## Trust & flagging

| # | Test | Steps | Expected | Pass? |
|---|---|---|---|---|
| T-01 | New account 1-star | New account posts 1-star with detail | Review published but flagged | |
| T-02 | IP flag | 3 accounts, same IP, post reviews | Auto-flagged in admin queue | |
| T-03 | Verified badge | Admin approves receipt | "Verified visit" badge on review | |
| T-04 | Receipt privacy | View review with verified badge | Receipt image NOT visible publicly | |

---

## User pages

| # | Test | Steps | Expected | Pass? |
|---|---|---|---|---|
| U-01 | Public profile | Visit `/u/{username}` | Display name, reviews listed | |
| U-02 | My reviews | Visit `/dashboard/reviews` | All user's reviews with status | |
| U-03 | Suggest brand | Submit brand suggestion | Success message; appears in admin | |

---

## Admin

| # | Test | Steps | Expected | Pass? |
|---|---|---|---|---|
| AD-01 | Admin gate | Visit `/admin` as regular user | Access denied message | |
| AD-02 | Dashboard stats | Login as admin, visit `/admin` | Stats cards with counts | |
| AD-03 | Moderation approve | Approve flagged review | Review published | |
| AD-04 | Moderation suspend | Suspend review | Hidden from public | |
| AD-05 | Moderation remove | Remove review | Soft-deleted | |
| AD-06 | Receipt verify | Approve receipt in queue | Verified badge applied | |
| AD-07 | Brand create | Create brand at `/admin/brands` | Brand appears in listing | |
| AD-08 | Brand edit | Edit existing brand | Changes reflected on public page | |
| AD-09 | Brand deactivate | Deactivate brand | No longer in public listing | |
| AD-10 | Suggestion approve | Approve user suggestion | New brand created | |

---

## Legal

| # | Test | Steps | Expected | Pass? |
|---|---|---|---|---|
| L-01 | Terms page | Visit `/terms` | Content renders | |
| L-02 | Privacy page | Visit `/privacy` | NDPR-relevant content | |
| L-03 | Guidelines page | Visit `/review-guidelines` | Do/don't rules visible | |

---

## Performance & mobile

| # | Test | Steps | Expected | Pass? |
|---|---|---|---|---|
| M-01 | Mobile home | View `/` on phone viewport | Readable, search usable | |
| M-02 | Mobile brand page | View brand detail on phone | Sticky CTA or clear write button | |
| M-03 | Page load | Brand page on 3G throttle | Loads <5s | |

---

## Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Developer | | | |
| Founder | | | |
| Founder | | | |

**Launch approved:** Yes / No — hold for: _______________
