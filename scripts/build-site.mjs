import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(root, 'public-site');
const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const version = String(metadata.version || '');
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error('package.json must contain a stable MAJOR.MINOR.PATCH version before building.');
}
if (!output.startsWith(`${root}${sep}`) || output === root) throw new Error('Invalid static site output directory.');

await mkdir(output, { recursive: true });
const assetFiles = ['styles.css', 'goodsend-agent.mjs', 'favicon.svg'];
for (const filename of assetFiles) await copyFile(resolve(root, filename), resolve(output, filename));

const sourceHtml = await readFile(resolve(root, 'index.html'), 'utf8');
let versionedHtml = sourceHtml;
for (const [pattern, replacement, description] of [
  [/href="favicon\.svg(?:\?[^\"]*)?"/, `href="favicon.svg?v=${version}"`, 'favicon'],
  [/href="styles\.css(?:\?[^\"]*)?"/, `href="styles.css?v=${version}"`, 'stylesheet'],
  [/src="script\.js(?:\?[^\"]*)?"/, `src="script.js?v=${version}"`, 'app script']
]) {
  if ((versionedHtml.match(pattern) || []).length !== 1) throw new Error(`Expected one ${description} reference in index.html.`);
  versionedHtml = versionedHtml.replace(pattern, replacement);
}
await writeFile(resolve(output, 'index.html'), versionedHtml);

const sourceScript = await readFile(resolve(root, 'script.js'), 'utf8');
const versionedScript = sourceScript.replace(
  /from\s+(['"])\.\/goodsend-agent\.mjs(?:\?[^'"]*)?\1/,
  `from './goodsend-agent.mjs?v=${version}'`
);
if (versionedScript === sourceScript || !versionedScript.includes(`./goodsend-agent.mjs?v=${version}`)) {
  throw new Error('Could not add a release cache key to the agent module.');
}
await writeFile(resolve(output, 'script.js'), versionedScript);
await writeFile(resolve(output, 'app-version.json'), `${JSON.stringify({ version }, null, 2)}\n`);

console.log(`Built GodSend v${version} into ${output}`);
