# TalkGround — Business & Pitch Documents

**These are NOT developer documents.** Use these for investors, partners, press, and GTM.

Developer docs live in `docs/` (PRD, API spec, architecture, etc.).

---

## Document index

| # | Source (Markdown) | PDF output | Use when |
|---|---|---|---|
| 1 | [01-EXECUTIVE-SUMMARY.md](./01-EXECUTIVE-SUMMARY.md) | `pdf/01-Executive-Summary.pdf` | First meeting with anyone |
| 2 | [02-INVESTOR-PITCH-DECK.md](./02-INVESTOR-PITCH-DECK.md) | `pdf/02-Investor-Pitch-Deck.pdf` | Investor meetings (slide content) |
| 3 | [03-INVESTOR-ONE-PAGER.md](./03-INVESTOR-ONE-PAGER.md) | `pdf/03-Investor-One-Pager.pdf` | Email attachment after intro |
| 4 | [04-MARKET-OPPORTUNITY.md](./04-MARKET-OPPORTUNITY.md) | `pdf/04-Market-Opportunity.pdf` | Deep-dive on market size & gap |
| 5 | [05-COMPETITIVE-ANALYSIS.md](./05-COMPETITIVE-ANALYSIS.md) | `pdf/05-Competitive-Analysis.pdf` | Investor due diligence |
| 6 | [06-GTM-STRATEGY.md](./06-GTM-STRATEGY.md) | `pdf/06-GTM-Strategy.pdf` | Launch planning, accelerator apps |
| 7 | [07-B2B-PARTNERSHIP-PITCH.md](./07-B2B-PARTNERSHIP-PITCH.md) | `pdf/07-B2B-Partnership-Pitch.pdf` | Pitching restaurants/hotels |
| 8 | [08-PRODUCT-ONE-PAGER.md](./08-PRODUCT-ONE-PAGER.md) | `pdf/08-Product-One-Pager.pdf` | General audience, social sharing |
| 9 | [09-PRESS-MEDIA-KIT.md](./09-PRESS-MEDIA-KIT.md) | `pdf/09-Press-Media-Kit.pdf` | Journalists, bloggers, influencers |
| 10 | [10-FINANCIAL-PROJECTIONS.md](./10-FINANCIAL-PROJECTIONS.md) | `pdf/10-Financial-Projections.pdf` | Investor financial conversations |
| 11 | [11-SURVEY-RESULTS-REPORT.md](./11-SURVEY-RESULTS-REPORT.md) | `pdf/11-Survey-Results-Report.pdf` | After survey campaign (fill metrics) |
| 12 | [12-BRAND-GUIDELINES.md](./12-BRAND-GUIDELINES.md) | `pdf/12-Brand-Guidelines.pdf` | Design, marketing, partners |

---

## Generate PDFs

```bash
cd c:\Users\USER\Desktop\TalkGround-backend
npm run docs:pdf
```

PDFs are saved to `docs/business/pdf/`.

### Manual alternative (no script)

1. Open any `.md` file in VS Code
2. Install "Markdown PDF" extension
3. Right-click → **Markdown PDF: Export (pdf)**

Or paste content into Google Docs / Canva and export as PDF.

---

## Before sharing externally

Replace all `[PLACEHOLDER]` fields:
- Founder names, emails, phone
- Company legal name (CAC)
- Funding ask amount
- Survey/waitlist metrics (after campaigns)
- Logo assets (add to press kit)

**Legal docs** (Terms, Privacy, Review Guidelines) are in `docs/` — get lawyer review before publishing.

---

## Which doc for which situation

| Situation | Send this |
|---|---|
| Cold email to investor | 03-Investor-One-Pager.pdf |
| Investor meeting | 02-Investor-Pitch-Deck.pdf + 01-Executive-Summary.pdf |
| Accelerator application | 01 + 04 + 06 + 10 |
| Restaurant owner meeting | 07-B2B-Partnership-Pitch.pdf + 08-Product-One-Pager.pdf |
| Press / blog feature | 09-Press-Media-Kit.pdf |
| After survey completes | 11-Survey-Results-Report.pdf (filled in) |
| Designer / marketer onboarding | 12-Brand-Guidelines.pdf |
