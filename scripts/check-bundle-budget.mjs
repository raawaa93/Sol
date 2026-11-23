import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const assetsDir = path.join(dist, 'assets');
const htmlPath = path.join(dist, 'index.html');
const budgets = {
  initialJsKiB: 100,
  allJsKiB: 240,
  cssKiB: 14,
};

if (!fs.existsSync(htmlPath) || !fs.existsSync(assetsDir)) {
  console.error('Bundle budget requires a completed Vite build in dist/. Run npm run build first.');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const initialJsFiles = [...html.matchAll(/(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']/g)]
  .map((match) => path.basename(new URL(match[1], 'https://volterra.invalid').pathname));
const uniqueInitialJsFiles = [...new Set(initialJsFiles)];
const assetFiles = fs.readdirSync(assetsDir);
const jsFiles = assetFiles.filter((file) => file.endsWith('.js'));
const cssFiles = assetFiles.filter((file) => file.endsWith('.css'));

if (!uniqueInitialJsFiles.length) {
  console.error('Could not find the initial JavaScript entry and preloads in dist/index.html.');
  process.exit(1);
}

function gzipBytes(file) {
  const fullPath = path.join(assetsDir, file);
  if (!fs.existsSync(fullPath)) throw new Error(`HTML references missing bundle asset: ${file}`);
  return gzipSync(fs.readFileSync(fullPath), { level: 9 }).length;
}

const initialJsBytes = uniqueInitialJsFiles.reduce((sum, file) => sum + gzipBytes(file), 0);
const allJsBytes = jsFiles.reduce((sum, file) => sum + gzipBytes(file), 0);
const cssBytes = cssFiles.reduce((sum, file) => sum + gzipBytes(file), 0);
const kib = (bytes) => bytes / 1024;
const results = [
  ['Initial JS (entry + preloads)', kib(initialJsBytes), budgets.initialJsKiB],
  ['All JS chunks (including deferred)', kib(allJsBytes), budgets.allJsKiB],
  ['All CSS', kib(cssBytes), budgets.cssKiB],
];

console.log('Gzip-equivalent bundle budget (compressed bytes; not a Core Web Vitals measurement)');
for (const [label, actual, limit] of results) {
  const status = actual <= limit ? 'PASS' : 'FAIL';
  console.log(`${status} ${label}: ${actual.toFixed(2)} KiB / ${limit.toFixed(0)} KiB`);
}

const exceeded = results.filter(([, actual, limit]) => actual > limit);
if (exceeded.length) process.exit(1);
