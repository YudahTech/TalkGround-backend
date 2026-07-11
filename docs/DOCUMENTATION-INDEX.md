# Revyu — Documentation Index

**Project:** Revyu  
**Location:** `c:\Users\USER\Desktop\revyu`  
**Last updated:** June 2026

---

## How to use this index

| If you are… | Start here |
|---|---|
| New developer joining the project | [GETTING-STARTED.md](./GETTING-STARTED.md) |
| Setting up your machine | [ENVIRONMENT-SETUP.md](./ENVIRONMENT-SETUP.md) |
| Refreshing on NestJS/Postgres/Prisma/Docker | [COURSE-NESTJS-POSTGRES-PRISMA-DOCKER.md](./COURSE-NESTJS-POSTGRES-PRISMA-DOCKER.md) |
| Building a feature | [PRD-v1.0.md](./PRD-v1.0.md) + [API-SPECIFICATION.md](./API-SPECIFICATION.md) |
| **Frontend integration (separate repo)** | [FRONTEND-INTEGRATION.md](./FRONTEND-INTEGRATION.md) + Swagger `http://localhost:3001/docs` |
| **Testing all API endpoints** | [API-TESTING-GUIDE.md](./API-TESTING-GUIDE.md) |
| **Adding/finding Swagger endpoints** | [SWAGGER-GUIDE.md](./SWAGGER-GUIDE.md) |
| UI screen → endpoint mapping | [DESIGN-BACKEND-MAPPING.md](./DESIGN-BACKEND-MAPPING.md) |
| Moderating content | [ADMIN-MODERATION-SOP.md](./ADMIN-MODERATION-SOP.md) |
| Running validation / GTM | [SURVEY-INSTRUMENT.md](./SURVEY-INSTRUMENT.md) + [WAITLIST-INSTRUMENT.md](./WAITLIST-INSTRUMENT.md) |
| Pitching investors | [business/pdf/03-Investor-One-Pager.pdf](./business/pdf/03-Investor-One-Pager.pdf) |
| All PDF exports | [PDF-EXPORTS.md](./PDF-EXPORTS.md) |
| Pre-launch checklist | [LAUNCH-RUNBOOK.md](./LAUNCH-RUNBOOK.md) |
| QA before release | [ACCEPTANCE-TEST-CHECKLIST.md](./ACCEPTANCE-TEST-CHECKLIST.md) |

---

## Product documents

| # | Document | Description |
|---|---|---|
| 1 | [PRD-v1.0.md](./PRD-v1.0.md) | Product requirements — source of truth |
| 2 | [WIREFRAME-BRIEF.md](./WIREFRAME-BRIEF.md) | Page-by-page UI specification |
| 3 | [SURVEY-INSTRUMENT.md](./SURVEY-INSTRUMENT.md) | Validation survey questions + analysis plan |
| 4 | [WAITLIST-INSTRUMENT.md](./WAITLIST-INSTRUMENT.md) | Launch waitlist form + invite waves |
| 5 | [INVESTOR-ONE-PAGER.md](./INVESTOR-ONE-PAGER.md) | Investor summary deck in prose |
| 6 | [TERMS-OF-SERVICE.md](./TERMS-OF-SERVICE.md) | Legal — terms of service |
| 7 | [PRIVACY-POLICY.md](./PRIVACY-POLICY.md) | Legal — privacy policy (NDPR) |
| 8 | [REVIEW-GUIDELINES.md](./REVIEW-GUIDELINES.md) | Legal — user review rules |

---

## Engineering documents

| # | Document | Description |
|---|---|---|
| 9 | [GETTING-STARTED.md](./GETTING-STARTED.md) | Developer onboarding — what was built, how to run |
| 10 | [ENVIRONMENT-SETUP.md](./ENVIRONMENT-SETUP.md) | Tools, env vars, Docker, external services |
| 11 | [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, folder structure, data flow |
| 12 | [DATABASE-SCHEMA.md](./DATABASE-SCHEMA.md) | Tables, relationships, enums |
| 13 | [API-SPECIFICATION.md](./API-SPECIFICATION.md) | REST API contract |
| 14 | [FRONTEND-INTEGRATION.md](./FRONTEND-INTEGRATION.md) | **Handoff doc for frontend repo** |
| 15 | [API-TESTING-GUIDE.md](./API-TESTING-GUIDE.md) | Test every endpoint + expected results |
| 16 | [DESIGN-BACKEND-MAPPING.md](./DESIGN-BACKEND-MAPPING.md) | UI screens → API endpoints |
| 17 | [DOCKER-SETUP.md](./DOCKER-SETUP.md) | Docker Compose for PostgreSQL |
| 18 | [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md) | Staging + production deployment |
| 19 | [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) | What's built vs pending |
| — | **Swagger UI** | `http://localhost:3001/docs` (when API running) |
| — | **OpenAPI JSON** | `http://localhost:3001/docs/openapi.json` |

---

## Operations documents

| # | Document | Description |
|---|---|---|
| 17 | [ADMIN-MODERATION-SOP.md](./ADMIN-MODERATION-SOP.md) | Founder moderation playbook |
| 18 | [LAUNCH-RUNBOOK.md](./LAUNCH-RUNBOOK.md) | Soft launch → public launch steps |
| 19 | [ACCEPTANCE-TEST-CHECKLIST.md](./ACCEPTANCE-TEST-CHECKLIST.md) | QA checklist per feature |

---

## Learning

| # | Document | Description |
|---|---|---|
| 20 | [COURSE-NESTJS-POSTGRES-PRISMA-DOCKER.md](./COURSE-NESTJS-POSTGRES-PRISMA-DOCKER.md) | Full refresher course mapped to Revyu codebase |

---

## Business & pitch documents (PDFs)

**Separate from dev docs.** For investors, partners, press, and GTM.

📁 **`docs/business/pdf/`** — 12 ready-to-share PDFs  
📋 **[business/README.md](./business/README.md)** — index and usage guide

Regenerate after editing: `npm run docs:pdf`

See also: [PDF-EXPORTS.md](./PDF-EXPORTS.md) for product, legal, operations, and dev PDFs.
