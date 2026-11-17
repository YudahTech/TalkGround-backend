# TalkGround — Admin Moderation Standard Operating Procedure

**Version:** 1.0  
**Owner:** Founders  
**SLA target:** 48 hours for all queue items  
**Review cadence:** Twice daily (morning + evening) minimum

---

## 1. Purpose

This SOP defines how TalkGround founders moderate content at launch. Consistent moderation builds trust and reduces legal exposure.

**Principles:**
1. Never auto-remove flagged content without human review
2. Receipt images are admin-only — never publish or share externally
3. Document every removal/suspension with a reason note
4. When in doubt, suspend pending investigation — do not delete

---

## 2. Queue Overview

| Queue | Trigger | Priority |
|---|---|---|
| **Reported** | User clicks "Report review" | High |
| **Flagged** | Automated (IP, pattern, velocity, new-account 1★) | Medium |
| **Pending receipt** | User uploaded receipt | Normal |
| **Suspended** | Previously actioned — awaiting appeal/review | As needed |

Access: `/admin/reviews` → select queue tab.

---

## 3. Daily Moderation Routine

### Morning check (~15 min)

1. Open admin dashboard — note badge counts
2. Process **Reported** queue first (highest user impact)
3. Process **Flagged** queue — batch review similar flags
4. Process **Pending receipt** — target 10+ verifications

### Evening check (~10 min)

1. Re-check reported and flagged counts
2. Clear any remaining receipt queue items
3. Review new brand suggestions (approve/reject)

### Weekly (30 min)

1. Review suspended accounts — any repeat offenders?
2. Check brands with sudden review spikes
3. Export metrics for founder sync

---

## 4. Reported Review — Decision Tree

```
User reported review
        │
        ▼
Is it clearly spam/fake? ──Yes──► Remove + suspend user if repeat
        │No
        ▼
Is it offensive/hate speech? ──Yes──► Remove + warn/suspend user
        │No
        ▼
Is it likely never visited? ──Yes──► Suspend review; request doesn't auto-notify reviewer in MVP
        │No
        ▼
Is it a legitimate negative experience? ──Yes──► Dismiss report; keep published
        │Unsure
        ▼
Suspend pending investigation (max 48h)
```

### Report reasons — guidance

| Reason | Typical action |
|---|---|
| Fake / spam | Remove if no substance or obvious bot pattern |
| Never visited | Suspend; check user history and IP flags |
| Offensive | Remove; suspend on repeat |
| Paid / incentivized | Suspend; investigate brand if pattern across multiple reviews |
| Other | Read note; apply best judgment |

---

## 5. Flagged Review — Automated Flags

### IP hash match (>2 accounts, 7 days)

1. Open flag metadata — see linked accounts
2. If same person (obvious): remove newer reviews, suspend duplicate accounts
3. If shared location (office, university): dismiss flag if reviews are substantively different
4. If coordinated bombing: remove all flagged reviews, suspend accounts

### Duplicate text pattern

1. Compare flagged reviews side-by-side
2. If copy-paste: remove all copies, suspend accounts
3. If similar but legitimate (common experience): dismiss flag

### Velocity flag (>5 reviews on one brand in 1 hour)

1. Check if brand just had a launch event (legitimate surge possible)
2. Check review quality — thin/generic text → suspend pending
3. Contact brand only in extreme cases (post-MVP)

### New account + 1-star

1. Read review body — does it meet 50 char minimum with specific details?
2. Specific details (dish names, staff, prices) → dismiss flag, publish
3. Generic bombing text → suspend, monitor account

---

## 6. Receipt Verification

### Approve when:

- Receipt shows business name matching the brand (or close variant)
- Date is within reasonable window (≤90 days)
- Amount line items plausible for the business type
- Not an obvious stock image or photoshopped receipt

### Reject when:

- Wrong business entirely
- Illegible or no business identifier
- Duplicate receipt already used on another review
- Clearly fabricated

### On approval:

- Set `verifiedVisit: true`
- Review shows public badge: **Verified visit**
- Receipt image remains private

### On rejection:

- Review stays published (receipt was optional)
- No badge; no user notification in MVP (note for Phase 2)

---

## 7. Brand Suggestion Approval

### Approve when:

- Business exists and operates in stated city
- Not a duplicate of existing brand (check similar names)
- Category and sub-type correct
- Minimum info present: name, city, area

### Reject when:

- Duplicate
- Business doesn't exist or can't be verified
- Spam/joke submission

**On approve:** Brand goes live immediately as `active`. Suggester is not notified in MVP.

---

## 8. User Suspension

Suspend account when:
- 2+ removed reviews for spam/fake
- Coordinated attack pattern confirmed
- Offensive content after warning

**Do not suspend for:** honest negative reviews with specific detail.

Record: `{ suspended: true, reason: "..." }` in admin panel.

---

## 9. Escalation & Legal

### Takedown request (business claims defamation)

1. Do not auto-remove
2. Review against Review Guidelines
3. If review is opinion with specific facts → keep; reply to business with policy
4. If contains demonstrably false factual claims → suspend pending founder discussion
5. Log all correspondence

### Contact email (configure before launch)

`moderation@revyu.ng` or founder email

---

## 10. Metrics to Track

| Metric | Target |
|---|---|
| Queue items >48h old | 0 |
| False removal rate | <5% |
| Receipt approval rate | Track weekly |
| Reports dismissed vs actioned | Track ratio |

---

## 11. Pre-Launch Checklist

- [ ] Both founders have admin accounts
- [ ] Moderation email configured
- [ ] Review Guidelines published at `/review-guidelines`
- [ ] Test run: process 5 mock flagged reviews in staging
- [ ] Receipt verification tested with 3 sample images

---

## Appendix: Action Codes

| Action | Effect |
|---|---|
| `approve` | Publish / restore review |
| `suspend` | Hide from public; keep in DB |
| `remove` | Soft-delete; status `removed` |
| `dismiss_report` | Keep published; close report |
| `verify_receipt` approved | Add verified badge |
| `verify_receipt` rejected | No badge; close queue item |
