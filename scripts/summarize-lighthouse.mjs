import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = path.resolve(root, process.env.LIGHTHOUSE_REPORT_DIR || '.lighthouseci');
const manifestPath = path.join(reportDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('Lighthouse manifest not found. Run npm run perf:lighthouse first.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const representative = manifest.find((entry) => entry.isRepresentativeRun) ?? manifest[0];
if (!representative?.jsonPath || !fs.existsSync(representative.jsonPath)) {
  console.error('No representative Lighthouse JSON report was recorded in the manifest.');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(representative.jsonPath, 'utf8'));
const categoryScore = (id) => {
  const score = report.categories?.[id]?.score;
  return typeof score === 'number' ? `${Math.round(score * 100)}/100` : 'n/a';
};
const auditValue = (id) => {
  const value = report.audits?.[id]?.numericValue;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};
const milliseconds = (id) => {
  const value = auditValue(id);
  return value === undefined ? 'n/a' : `${Math.round(value)} ms`;
};
const cls = auditValue('cumulative-layout-shift');
const runCount = manifest.length;
const label = process.env.LIGHTHOUSE_LABEL || 'Lighthouse';
const line = [
  `${label} representative (median) from ${runCount} runs`,
  `Performance ${categoryScore('performance')}`,
  `Accessibility ${categoryScore('accessibility')}`,
  `Best Practices ${categoryScore('best-practices')}`,
  `SEO ${categoryScore('seo')}`,
  `FCP ${milliseconds('first-contentful-paint')}`,
  `LCP ${milliseconds('largest-contentful-paint')}`,
  `TBT ${milliseconds('total-blocking-time')}`,
  `CLS ${cls === undefined ? 'n/a' : cls.toFixed(3)}`,
].join(' · ');

console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### ${label} Lighthouse baseline\n\n${line}\n`);
}
const annotation = line.replace(/%/g, '%25').replace(/\r/g, ' ').replace(/\n/g, ' ');
console.log(`::notice title=${label} Lighthouse baseline::${annotation}`);
