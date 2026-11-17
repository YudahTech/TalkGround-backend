# TalkGround — Launch Waitlist Instrument

**Purpose:** Capture launch-ready users for controlled rollout  
**Route:** `/waitlist`  
**Completion time:** ~45 seconds  
**Incentive:** None

---

## Form Fields

| Field | Type | Required | Validation |
|---|---|---|---|
| Full name | Text | Yes | Min 2 chars |
| Email | Email | Yes | Valid email format |
| Phone | Tel | No | Nigerian format if provided |
| Primary city | Select | Yes | Lagos / Abuja / Other |
| Primary use | Select | Yes | See options below |
| How did you hear about us? | Select | No | Attribution |
| Consent | Checkbox | Yes | Must be checked |

### Primary use options

- I mostly need restaurant recommendations
- I mostly need hotel / short-let recommendations
- I need both equally
- I want to write reviews for others

### Attribution options

- Twitter/X
- Instagram
- WhatsApp
- Friend or colleague
- Google search
- Other

---

## Consent Copy

> I agree to be contacted by TalkGround about the launch and I have read the Privacy Policy.

**Microcopy below form:**

> We will only use your details to notify you about TalkGround. No spam. You can request deletion at any time.

---

## Success Screen

**Headline:** You're on the list.

**Body:** We'll email you when TalkGround goes live in Lagos and Abuja. You'll be among the first to search, read, and write trusted reviews.

**Secondary CTA:** While you wait — take our 3-minute survey. [Take survey →]

---

## Launch Invite Waves

| Wave | Date | Cohort |
|---|---|---|
| 0 — Friends & family | 28 Jul 2026 | 20–30 manual invites |
| 1 — Early waitlist | 29 Jul 2026 | First 50% |
| 2 — Remaining waitlist | 31 Jul 2026 | Rest of list |
| 3 — Public | 1 Aug 2026 | Open registration |

### Segmentation

- Lagos signups → onboarding email highlights Lagos brands
- "Write reviews" users → CTA to review a known brand
- Survey + waitlist same email → tag `high-intent`

---

## Data Schema

```typescript
WaitlistEntry {
  id: string
  fullName: string
  email: string
  phone?: string
  city: 'lagos' | 'abuja' | 'other'
  primaryUse: 'restaurants' | 'hotels' | 'both' | 'write_reviews'
  attribution?: string
  consentGiven: boolean
  createdAt: DateTime
  invitedAt?: DateTime
  registeredAt?: DateTime
}
```

Keep separate from `SurveyResponse` table. Link by email only when both exist.
