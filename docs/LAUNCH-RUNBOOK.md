# TalkGround — Launch Runbook

**Soft launch:** 28 July 2026  
**Public launch:** 1 August 2026  
**Markets:** Lagos + Abuja  
**Vertical:** Restaurants + Hotels

---

## T-minus 4 weeks (1 July)

### Engineering
- [ ] All acceptance tests pass (see ACCEPTANCE-TEST-CHECKLIST.md)
- [ ] Production env deployed (staging first)
- [ ] Cloudinary + Termii live on staging
- [ ] Admin accounts created for both founders

### Content
- [ ] 100+ brands seeded (70 Lagos, 30 Abuja)
- [ ] 20–30 founder-written authentic reviews on flagship brands
- [ ] Legal pages live and lawyer-reviewed

### GTM
- [ ] Survey live and promoted
- [ ] Waitlist live and promoted
- [ ] Target: 200+ waitlist signups

---

## T-minus 2 weeks (15 July)

- [ ] CAC company registered
- [ ] 150+ brands seeded
- [ ] Soft launch staging tested end-to-end
- [ ] Moderation SOP walkthrough with both founders
- [ ] Test receipt verification flow with 5 sample receipts

---

## T-minus 1 week (22 July)

- [ ] 200 brands seeded
- [ ] Production deployment complete
- [ ] Admin password changed from default
- [ ] Waitlist segmented by city (Lagos / Abuja)
- [ ] Launch emails drafted

---

## Launch waves

### Wave 0 — Friends & family (28 July)

| Item | Detail |
|---|---|
| Size | 20–30 people |
| Access | Manual accounts or early invite links |
| Goal | Catch critical bugs before wider release |
| Monitor | Error logs, moderation queue, page load times |

### Wave 1 — Early waitlist (29 July)

| Item | Detail |
|---|---|
| Size | First 50% of waitlist |
| Email | "You're in — TalkGround is live for you" |
| CTA | Review a brand you know |

### Wave 2 — Remaining waitlist (31 July)

| Item | Detail |
|---|---|
| Size | Rest of waitlist |
| Email | Same template, city-specific brand highlights |

### Wave 3 — Public (1 August)

| Item | Detail |
|---|---|
| Access | Open registration |
| PR | Social media push, founder posts |
| Monitor | Moderation queue every 4 hours |

---

## Launch day checklist (1 August)

### Morning (8am)
- [ ] Both founders online
- [ ] Check API + web are up (uptime monitor)
- [ ] Check moderation queue is empty
- [ ] Open registration confirmed working

### Midday (12pm)
- [ ] Review signups count
- [ ] Review first user-submitted reviews
- [ ] Respond to any support emails

### Evening (6pm)
- [ ] Process all moderation queues
- [ ] Log metrics: signups, reviews, waitlist conversions
- [ ] Post launch update on social media

---

## Post-launch week 1 (daily)

| Task | Owner | Frequency |
|---|---|---|
| Moderation queue | Founders | 2x daily |
| Brand suggestion approval | Founders | Daily |
| Brand seeding (5/day) | Founders | Daily |
| Error log review | Dev | Daily |
| Metrics snapshot | Founders | Daily |

### Week 1 targets

| Metric | Target |
|---|---|
| Registered users | 100+ |
| Published reviews | 50+ |
| Brands listed | 200+ |
| Moderation SLA | <48h |

---

## Incident response

| Severity | Example | Action |
|---|---|---|
| P0 | Site down | Dev fixes immediately; communicate on social |
| P1 | Spam flood | Enable stricter rate limits; founders moderate |
| P2 | Single bad review dispute | Follow moderation SOP; don't auto-remove |
| P3 | UI bug | Log issue; fix in next deploy |

**Contact:** `moderation@revyu.ng` (configure before launch)

---

## Rollback triggers

Rollback public launch if:
- Auth completely broken
- Data loss detected
- Unable to moderate spam (>50 fake reviews/hour unchecked)

Rollback = disable registration + display maintenance page. Do not delete data.
