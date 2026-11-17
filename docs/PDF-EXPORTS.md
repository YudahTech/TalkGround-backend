# TalkGround — PDF Exports

All shareable documents exported as PDF. **Markdown sources remain the master** — edit `.md` files, then regenerate PDFs.

```bash
npm run docs:pdf
```

---

## PDF folders

| Folder | Contents | Share with |
|---|---|---|
| [business/pdf/](./business/pdf/) | 12 pitch & GTM docs | Investors, partners, press |
| [pdf/product/](./pdf/product/) | PRD, wireframes, survey/waitlist | Stakeholders, designers, field team |
| [pdf/legal/](./pdf/legal/) | Terms, Privacy, Review Guidelines | Lawyer, website, users |
| [pdf/operations/](./pdf/operations/) | Launch runbook, moderation SOP, QA | Founders, moderators |
| [pdf/dev/](./pdf/dev/) | API, architecture, course, setup | Developers (offline reference) |

---

## Markdown only (not exported)

These stay as `.md` because they change frequently or are indexes:

- `DOCUMENTATION-INDEX.md` — master index
- `IMPLEMENTATION-STATUS.md` — living tracker
- `business/README.md` — business doc index

---

## Full export list (30 PDFs)

### business/pdf/ (12)
Executive Summary, Pitch Deck, Investor One-Pager, Market Opportunity, Competitive Analysis, GTM Strategy, B2B Pitch, Product One-Pager, Press Kit, Financial Projections, Survey Results Report, Brand Guidelines

### pdf/product/ (4)
PRD v1.0, Wireframe Brief, Survey Instrument, Waitlist Instrument

### pdf/legal/ (3)
Terms of Service, Privacy Policy, Review Guidelines

### pdf/operations/ (3)
Launch Runbook, Admin Moderation SOP, Acceptance Test Checklist

### pdf/dev/ (8)
Getting Started, Environment Setup, Docker Setup, Architecture, Database Schema, API Specification, Deployment Guide, NestJS/Postgres/Prisma/Docker Course
