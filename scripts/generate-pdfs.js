/**
 * Generate PDF exports for all shareable Revyu documents.
 * Run: npm run docs:pdf
 *
 * Output:
 *   docs/business/pdf/   — pitch & GTM (12 files)
 *   docs/pdf/product/    — PRD, wireframes, survey/waitlist instruments
 *   docs/pdf/legal/      — Terms, Privacy, Review Guidelines
 *   docs/pdf/operations/ — Launch runbook, moderation SOP, QA checklist
 *   docs/pdf/dev/        — API, architecture, course, setup guides
 */
const { mdToPdf } = require('md-to-pdf');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const BUSINESS_DIR = path.join(DOCS, 'business');
const CSS_FILE = path.join(BUSINESS_DIR, 'pdf-style.css');

const SECTIONS = [
  {
    label: 'Business & pitch',
    outDir: path.join(BUSINESS_DIR, 'pdf'),
    files: [
      ['01-EXECUTIVE-SUMMARY.md', '01-Executive-Summary.pdf'],
      ['02-INVESTOR-PITCH-DECK.md', '02-Investor-Pitch-Deck.pdf'],
      ['03-INVESTOR-ONE-PAGER.md', '03-Investor-One-Pager.pdf'],
      ['04-MARKET-OPPORTUNITY.md', '04-Market-Opportunity.pdf'],
      ['05-COMPETITIVE-ANALYSIS.md', '05-Competitive-Analysis.pdf'],
      ['06-GTM-STRATEGY.md', '06-GTM-Strategy.pdf'],
      ['07-B2B-PARTNERSHIP-PITCH.md', '07-B2B-Partnership-Pitch.pdf'],
      ['08-PRODUCT-ONE-PAGER.md', '08-Product-One-Pager.pdf'],
      ['09-PRESS-MEDIA-KIT.md', '09-Press-Media-Kit.pdf'],
      ['10-FINANCIAL-PROJECTIONS.md', '10-Financial-Projections.pdf'],
      ['11-SURVEY-RESULTS-REPORT.md', '11-Survey-Results-Report.pdf'],
      ['12-BRAND-GUIDELINES.md', '12-Brand-Guidelines.pdf'],
    ],
    sourceDir: BUSINESS_DIR,
  },
  {
    label: 'Product',
    outDir: path.join(DOCS, 'pdf', 'product'),
    sourceDir: DOCS,
    files: [
      ['PRD-v1.0.md', 'PRD-v1.0.pdf'],
      ['WIREFRAME-BRIEF.md', 'Wireframe-Brief.pdf'],
      ['SURVEY-INSTRUMENT.md', 'Survey-Instrument.pdf'],
      ['WAITLIST-INSTRUMENT.md', 'Waitlist-Instrument.pdf'],
    ],
  },
  {
    label: 'Legal',
    outDir: path.join(DOCS, 'pdf', 'legal'),
    sourceDir: DOCS,
    files: [
      ['TERMS-OF-SERVICE.md', 'Terms-of-Service.pdf'],
      ['PRIVACY-POLICY.md', 'Privacy-Policy.pdf'],
      ['REVIEW-GUIDELINES.md', 'Review-Guidelines.pdf'],
    ],
  },
  {
    label: 'Operations',
    outDir: path.join(DOCS, 'pdf', 'operations'),
    sourceDir: DOCS,
    files: [
      ['LAUNCH-RUNBOOK.md', 'Launch-Runbook.pdf'],
      ['ADMIN-MODERATION-SOP.md', 'Admin-Moderation-SOP.pdf'],
      ['ACCEPTANCE-TEST-CHECKLIST.md', 'Acceptance-Test-Checklist.pdf'],
    ],
  },
  {
    label: 'Developer reference',
    outDir: path.join(DOCS, 'pdf', 'dev'),
    sourceDir: DOCS,
    files: [
      ['GETTING-STARTED.md', 'Getting-Started.pdf'],
      ['ENVIRONMENT-SETUP.md', 'Environment-Setup.pdf'],
      ['DOCKER-SETUP.md', 'Docker-Setup.pdf'],
      ['ARCHITECTURE.md', 'Architecture.pdf'],
      ['DATABASE-SCHEMA.md', 'Database-Schema.pdf'],
      ['API-SPECIFICATION.md', 'API-Specification.pdf'],
      ['DEPLOYMENT-GUIDE.md', 'Deployment-Guide.pdf'],
      ['COURSE-NESTJS-POSTGRES-PRISMA-DOCKER.md', 'Course-NestJS-Postgres-Prisma-Docker.pdf'],
    ],
  },
];

// Living docs — markdown only (edit frequently, not exported)
const MARKDOWN_ONLY = [
  'DOCUMENTATION-INDEX.md',
  'IMPLEMENTATION-STATUS.md',
  'INVESTOR-ONE-PAGER.md', // duplicate of business/03
  'business/README.md',
];

const PDF_OPTIONS = {
  pdf_options: {
    format: 'A4',
    margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
    printBackground: true,
  },
};

async function convertOne(mdPath, pdfPath, css) {
  const pdf = await mdToPdf({ path: mdPath }, { css, ...PDF_OPTIONS });
  if (pdf.content) {
    fs.writeFileSync(pdfPath, pdf.content);
    return true;
  }
  return false;
}

async function generate() {
  const css = fs.existsSync(CSS_FILE) ? fs.readFileSync(CSS_FILE, 'utf8') : '';
  let ok = 0;
  let fail = 0;

  console.log('Revyu — generating PDF exports\n');
  console.log('Markdown-only (not exported):');
  MARKDOWN_ONLY.forEach((f) => console.log(`  · ${f}`));
  console.log('');

  for (const section of SECTIONS) {
    if (!fs.existsSync(section.outDir)) {
      fs.mkdirSync(section.outDir, { recursive: true });
    }

    console.log(`── ${section.label} ──`);

    for (const [mdFile, pdfFile] of section.files) {
      const mdPath = path.join(section.sourceDir, mdFile);
      const pdfPath = path.join(section.outDir, pdfFile);

      if (!fs.existsSync(mdPath)) {
        console.log(`  SKIP  ${pdfFile}`);
        continue;
      }

      try {
        const success = await convertOne(mdPath, pdfPath, css);
        if (success) {
          console.log(`  OK    ${pdfFile}`);
          ok++;
        } else {
          console.log(`  FAIL  ${pdfFile} (empty output)`);
          fail++;
        }
      } catch (err) {
        console.log(`  FAIL  ${pdfFile}: ${err.message}`);
        fail++;
      }
    }
    console.log('');
  }

  console.log(`Done: ${ok} PDFs generated, ${fail} failed.`);
  console.log('\nOutput folders:');
  console.log('  docs/business/pdf/     (pitch & GTM)');
  console.log('  docs/pdf/product/      (PRD, wireframes, instruments)');
  console.log('  docs/pdf/legal/        (Terms, Privacy, Guidelines)');
  console.log('  docs/pdf/operations/   (Runbook, SOP, QA)');
  console.log('  docs/pdf/dev/          (API, architecture, course)');
}

generate().catch(console.error);
