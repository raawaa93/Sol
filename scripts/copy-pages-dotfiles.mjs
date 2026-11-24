import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const sourceDirectory = resolve(root, 'public/.well-known');
const manifestPath = resolve(sourceDirectory, 'ard.json');
const outputDirectory = resolve(root, 'dist');
const outputWellKnownDirectory = resolve(outputDirectory, '.well-known');

if (!existsSync(manifestPath)) {
  throw new Error('Required public/.well-known/ard.json is missing.');
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!manifest || !Array.isArray(manifest.entries)) {
  throw new Error('ARD manifest must contain an entries array.');
}

mkdirSync(outputWellKnownDirectory, { recursive: true });
cpSync(sourceDirectory, outputWellKnownDirectory, { recursive: true, force: true });
writeFileSync(resolve(outputDirectory, '.nojekyll'), '');

if (!existsSync(resolve(outputWellKnownDirectory, 'ard.json'))) {
  throw new Error('ARD manifest was not copied into the production output.');
}

console.log('Copied .well-known/ard.json and .nojekyll into dist.');
