# TalkGround — Design → Backend Mapping

**Audience:** Frontend + backend developers  
**Product scope:** Restaurants & hotels in **Lagos** and **Abuja** only  
**Pattern:** Public discovery (Yelp / Trustpilot style), protected actions

---

## Access model

| Public (no login) | Login required |
|---|---|
| `GET /home` — landing feed | `POST /reviews` — write review |
| `GET /brands`, `/brands/filters` — explore | `GET /users/me/dashboard` — user overview |
| `GET /brands/:slug` — brand profile | `GET/PATCH /users/me` — profile settings |
| `GET /brands/:slug/reviews` — read reviews | `POST /reviews/:id/helpful` — mark helpful |
| `GET /users/:username` — public profile | `POST /uploads/signature` — photo upload |
| `POST /auth/register`, `/auth/login` | `GET /brands/:slug/context` — “already reviewed?” |
| `POST /survey/responses`, `/waitlist` | All `/admin/*` (ADMIN role) |

**Note:** Browsing brands and reviews is public so the explore and brand-detail screens work without forcing sign-up first — same as major review platforms. Only *actions* (write, vote, dashboard) require auth.

---

## Screen → API mapping

### Landing page (hero + featured reviews)

| UI element | API |
|---|---|
| Hero copy | `GET /home` → `data.hero` |
| Category chips (Dining / Hotels) | `GET /home` → `data.categories` + `?category=restaurants` |
| City filter | `?city=lagos` or `?city=abuja` |
| **Find trusted brands** cards | `GET /home` → `data.trustedBrandCards` |
| **Popular sectors** brand grid | `GET /home` → `data.sectorBrands` (+ `?category=` / `?sectorLimit=4`) |
| **Top rated this week** (5 items) | `GET /home` → `data.topRatedThisWeek` |
| Search | `GET /home?q=...` or `GET /brands?q=...` |

### Explore / results grid

| UI element | API |
|---|---|
| Sidebar categories | `GET /brands/filters` → `categories` (includes `count`) |
| Rating filter (4.0+, 3.0+) | `GET /brands?minRating=4` |
| Sort “Most Reviewed” | `GET /brands?sort=most_reviewed` |
| Brand cards (logo, rating, count, tags) | `GET /brands` → each item |
| “Showing X of Y” | `meta.showing`, `meta.total` |
| Load more | `?page=2&limit=9` |

### Brand detail page

| UI element | API |
|---|---|
| Header (name, rating, review count) | `GET /brands/:slug` |
| “Claimed profile” badge | `data.claimed` |
| Trust score sidebar | `data.trustScore`, `data.trustLabel` |
| Rating distribution bars | `data.ratingDistribution` (percentages) |
| About + tags | `data.description`, `data.tags` |
| Review list | `GET /brands/:slug/reviews?sort=recent` |
| Helpful count per review | `helpfulCount` on each review |
| “Write a review” button state | `GET /brands/:slug/context` (auth) |

### User dashboard

| UI element | API |
|---|---|
| Stats cards | `GET /users/me/dashboard` → `data.stats` (includes `reviewsThisWeek`, `helpfulVotesThisWeek`) |
| Recent reviews list | `data.recentReviews` |

### Profile settings

| UI element | API |
|---|---|
| Load profile | `GET /users/me` |
| Save name, bio, city, interests | `PATCH /users/me` |
| Avatar | `avatarUrl` field (URL from Cloudinary upload) |

---

## Test accounts (after seed)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@revyu.ng` | `admin123` |
| Demo user | `chinedu.okafor@gmail.com` | `demo1234` |

---

## Base URL

`http://localhost:3001/api/v1`
