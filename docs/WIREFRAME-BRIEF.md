# Revyu — Wireframe Brief v1.0

Page-by-page UI specification for design and frontend implementation.

**Design principles:** Trust-first, clean, mobile-first, fast on slow networks.  
**Brand tone:** Confident, Nigerian, no clutter. Green accent for trust/verified signals.

---

## Global Components

| Component | Spec |
|---|---|
| **Navbar** | Logo left; Search center (desktop) or icon (mobile); Login/Register or Avatar menu |
| **Footer** | Links: About, Survey, Waitlist, Terms, Privacy, Review Guidelines |
| **Search bar** | Placeholder: "Search restaurants and hotels in Lagos or Abuja" |
| **Star rating** | 1–5 filled stars; half stars not used |
| **Verified badge** | Green check + "Verified visit" on review cards |
| **City badge** | Lagos / Abuja pill on brand cards |
| **Empty state** | Illustration + headline + CTA (suggest brand / take survey) |

### Colour Tokens (suggested)

| Token | Value | Use |
|---|---|---|
| Primary | `#0F766E` (teal-700) | CTAs, links |
| Verified | `#16A34A` | Verified badge |
| Warning | `#D97706` | Flagged/pending states |
| Danger | `#DC2626` | Report, delete |
| Surface | `#F8FAFC` | Page background |
| Text | `#0F172A` | Body |

---

## 1. Home (`/`)

### Sections (top to bottom)

1. **Hero**
   - Headline: "Trusted reviews for where you eat and stay"
   - Sub: "Restaurants and hotels in Lagos & Abuja — reviewed by real people"
   - Full-width search bar
   - CTA buttons: "Browse brands" | "Join waitlist"

2. **Featured brands**
   - Horizontal scroll cards (mobile) / 4-column grid (desktop)
   - Card: logo, name, city, stars, review count
   - Only brands with ≥3 reviews

3. **Recent reviews**
   - 6 review snippets linking to brand pages
   - Show: stars, title, excerpt, author, verified badge if applicable

4. **How it works**
   - 3 steps with icons: Search → Read trusted reviews → Share your experience

5. **Categories**
   - Two large cards: Restaurants | Hotels & Stays

6. **CTA band**
   - "Help us build Revyu" → Survey + Waitlist buttons

---

## 2. Brand Listing (`/brands`)

### Layout

- **Top:** Page title + search bar (pre-filled from query)
- **Sidebar (desktop) / drawer (mobile):** Filters
  - City: Lagos, Abuja
  - Category: Restaurants, Hotels
  - Min rating: 1★–5★
- **Sort dropdown:** Highest rated (default), Most reviewed, Newest
- **Results:** Card grid
  - Logo, name, area, category, stars, count
- **Pagination** at bottom
- **Empty state:** "No brands found" + "Suggest a brand" link

---

## 3. Brand Detail (`/brand/{slug}`) — Priority page

### Header block

- Logo (80×80), name (H1), category + sub-type, city + area
- Website link (external icon)
- Average rating (large), total reviews
- Rating breakdown horizontal bars (5★ to 1★)
- Primary CTA: **Write a review** (or **Edit your review** if exists)

### Reviews section

- Sort tabs: Recent | Highest | Lowest | Verified first
- Review card:
  - Stars, title, body, pros/cons tags, recommend yes/no
  - Author display name → links to `/u/{username}`
  - Posted date + edited date if different
  - Photo thumbnails (lightbox on click)
  - Verified badge if applicable
  - Report icon (logged-in users)

### Sticky mobile CTA

- Fixed bottom bar: "Write a review"

---

## 4. Category Pages (`/category/restaurants`, `/category/hotels`)

- Hero with category name + description
- Sub-type filter chips (restaurants: Casual, Fast food, Fine dining, Buka)
- City filter
- Ranked list — "Top rated" requires ≥3 reviews
- Same brand card component as listing

---

## 5. Auth Pages

### Register (`/register`)

Fields: Display name, Username, Email, Phone, Password, Confirm password  
Checkbox: Agree to Terms + Privacy  
Submit: "Create account"  
Below: "Already have an account? Log in"

### Login (`/login`)

Email, Password, Forgot password link  
Redirect param support: `?redirect=/review/slug`

### Forgot password (`/forgot-password`)

Email field → success message "Check your inbox"

---

## 6. Write Review (`/review/{slug}`)

### Form layout

1. Brand mini-header (logo + name) — confirms correct brand
2. Star selector (required, interactive)
3. Title (max 100)
4. Review text (min 50, character counter)
5. Pros / Cons (optional text areas)
6. Recommend toggle (Yes / No)
7. Photo upload zone — "Add up to 3 photos"
8. Receipt upload zone — "Upload receipt for Verified visit badge (optional, kept private)"
9. Submit: "Publish review"

### Post-submit states

- Published → redirect to brand page with toast
- Receipt uploaded → banner: "Receipt pending verification"

### Gate screens

- Not logged in → redirect login
- Email/phone not verified → verification prompt screen

---

## 7. User Pages

### Public profile (`/u/{username}`)

- Avatar placeholder (initials), display name, @username, member since
- Review count stat
- List of published reviews (same card as brand page, compact)

### My reviews (`/dashboard/reviews`)

- Table/cards with: brand name, rating, status badge, date
- Actions: Edit, Delete
- Status badges: Published, Pending verification, Flagged, Removed

---

## 8. Suggest Brand (`/suggest-brand`)

Form: Name, Category, Sub-type, City, Area, Website (optional)  
Submit → success: "Thanks! We'll review your suggestion."

---

## 9. Admin Pages

### Dashboard (`/admin`)

- Stat cards: Brands, Reviews, Users, Pending items
- Quick links to queues with badge counts

### Brand management (`/admin/brands`)

- Data table: name, city, category, status, actions
- Create/Edit modal: all brand fields + logo URL upload
- Deactivate (soft delete)

### Review moderation (`/admin/reviews`)

- Tabbed queues: Reported | Flagged | Pending receipt | Suspended
- Review detail panel:
  - Full review content
  - Flag metadata (IP hash match count, pattern type)
  - Reporter notes
  - Receipt image (admin-only view)
- Actions: Approve, Suspend, Remove, Dismiss, Verify receipt

### Suggestions (`/admin/suggestions`)

- Pending list with suggester info
- Approve (creates brand) / Reject with note

---

## 10. Survey (`/survey`)

- Progress bar (sections)
- One question per screen on mobile; grouped on desktop
- See [SURVEY-INSTRUMENT.md](./SURVEY-INSTRUMENT.md) for full question set
- End screen: thank you + optional email capture + waitlist CTA

---

## 11. Waitlist (`/waitlist`)

- Minimal form: Name, Email, Phone (optional), City, Primary use, Attribution
- Consent checkbox
- Success screen: "You're on the list" + survey CTA

---

## 12. Legal Pages

Simple prose layout: Terms, Privacy, Review Guidelines — readable max-width 720px.

---

## Responsive Breakpoints

| Breakpoint | Width | Notes |
|---|---|---|
| Mobile | <640px | Single column, bottom CTA |
| Tablet | 640–1024px | 2-column grids |
| Desktop | >1024px | Sidebar filters, 3–4 column grids |

---

## Accessibility

- Minimum touch target 44×44px
- Form labels always visible
- Star rating keyboard navigable
- Alt text on all uploaded images
- Colour contrast WCAG AA
