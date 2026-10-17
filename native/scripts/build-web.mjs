// Builds the AmpMap web app (repo root, Vite) into native/www so the iPhone app ships it
// bundled inside the app. The website on Vercel is built the same way and is not changed by this.
//
//   node scripts/build-web.mjs      -> native/www
//   npm run sync:ios                -> build + `cap sync ios`
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const out = resolve(here, '..', 'www');

if (!existsSync(join(root, 'node_modules', 'vite'))) {
  console.log('Installing web app dependencies (npm ci in repo root)...');
  execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });
}
rmSync(out, { recursive: true, force: true });
execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_NATIVE_BUILD: '1' },
});
const html = readFileSync(join(out, 'index.html'), 'utf8');
if (!html.includes('<div id="app"')) console.warn('warning: index.html has no #app root');
// The website's service worker and the /get smart link are web-only; the app never registers the worker.
writeFileSync(join(out, 'native-build.txt'), `AmpMap web bundle built ${new Date().toISOString()}\n`);
console.log('Built AmpMap web app into', out);
