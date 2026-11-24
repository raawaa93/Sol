import { readFile } from 'node:fs/promises';

const required = [
  ['PROJECT_CONTEXT.md', 'Canonical project:** Sol Financial and Investment Intelligence Assistant'],
  ['PROJECT_CONTEXT.md', 'Repository:** https://github.com/raawaa93/Sol'],
  ['PROJECT_CONTEXT.md', '**Status:** ACTIVE'],
  ['PROJECT_CONTEXT.md', 'Gold and silver are individual underlyings, not the product definition.'],
  ['PROJECT_CONTEXT.md', 'The user is physically resident in **Syria**, not the United Kingdom.'],
  ['PROJECT_CONTEXT.md', 'Do not enable live order execution or recommend funding for options trading from Syria'],
  ['PROJECT_CONTEXT.md', 'QuantLib is the independent pricing/Greeks validation candidate'],
  ['AGENTS.md', 'Before any work, read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).'],
  ['AGENTS.md', 'genuine vanilla options across all asset classes and venues'],
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
    console.error(`FAIL: ${file} is missing required governance marker: ${marker}`);
    failed = true;
  } else {
    console.log(`PASS: ${file} contains required governance marker`);
  }
}

if (failed) {
  console.error('Project context verification failed closed. Stop before making project changes.');
  process.exit(1);
}
console.log('Project context verification passed: Sol financial and investment intelligence scope; multi-asset options specialist scope; Syria legal gate enforced.');
