import { readFile } from 'node:fs/promises';

const required = [
  ['PROJECT_CONTEXT.md', 'Canonical project name:** Volterra Multi-Asset Options Decision Lab'],
  ['PROJECT_CONTEXT.md', 'Canonical repository:** https://github.com/raawaa93/Sol'],
  ['PROJECT_CONTEXT.md', '**Status:** ACTIVE'],
  ['PROJECT_CONTEXT.md', 'Gold is one underlying, not the product definition.'],
  ['AGENTS.md', 'Before any work, read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).'],
];

let failed = false;
for (const [file, marker] of required) {
  let content;
  try {
    content = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  } catch {
    console.error(`FAIL: required project-governance file missing: ${file}`);
    failed = true;
    continue;
  }
  if (!content.includes(marker)) {
    console.error(`FAIL: ${file} is missing required identity marker: ${marker}`);
    failed = true;
  } else {
    console.log(`PASS: ${file} contains required project identity marker`);
  }
}

if (failed) {
  console.error('Project identity verification failed closed. Stop before making project changes.');
  process.exit(1);
}
console.log('Project identity verification passed: raawaa93/Sol = Volterra Multi-Asset Options Decision Lab.');
