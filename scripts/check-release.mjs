import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = path => readFile(resolve(root, path), 'utf8');
const fail = message => { throw new Error(`Release check failed: ${message}`); };

const metadata = JSON.parse(await read('package.json'));
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(metadata.version || '')) {
  fail('package.json must contain a stable MAJOR.MINOR.PATCH version.');
}

const [changelog, html, appScript] = await Promise.all([
  read('CHANGELOG.md'),
  read('index.html'),
  read('script.js')
]);
if (!changelog.includes(`## [${metadata.version}]`)) {
  fail(`CHANGELOG.md needs a section for ${metadata.version}.`);
}
if (!html.includes('id="updatesPage"') || !html.includes('data-app-version')) {
  fail('index.html must include the product updates page and version label.');
}
const versionLabels = [...html.matchAll(/<[^>]*data-app-version[^>]*>([^<]*)</g)].map(match => match[1].trim());
if (!versionLabels.length || versionLabels.some(label => label !== `v${metadata.version}`)) {
  fail(`Every source version label in index.html must match v${metadata.version}.`);
}
if (!appScript.includes("new URL('./app-version.json', import.meta.url)")) {
  fail('script.js must load its displayed version from generated app-version.json.');
}
if (!appScript.includes('data-field="email"') || !appScript.includes('field-required') || !appScript.includes('data-field="jobTitle"') || !appScript.includes('data-field="jobId"') || !appScript.includes('field-optional')) {
  fail('The compose form must identify email as required and job title/ID as optional.');
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) fail(`index.html contains duplicate IDs: ${[...new Set(duplicates)].join(', ')}.`);

console.log(`Release metadata and page structure are valid for v${metadata.version}.`);
