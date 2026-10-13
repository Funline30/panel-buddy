// Checks the built, deployable files (site/ for the preview, or dist/ after `npm run build`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dir = ['site', 'dist'].map((d) => join(root, d)).find((d) => existsSync(join(d, 'index.html')));

test('built site: title, viewport, manifest, local assets, no broken placeholders', { skip: !dir && 'no build yet (run npm run build)' }, () => {
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.match(html, /<title>AmpMap[^<]*<\/title>/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1/);
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-touch-icon/);
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|#|mailto:)/.test(u));
  assert.ok(refs.length >= 4);
  for (const r of refs) assert.ok(existsSync(join(dir, r.replace(/^\.\//, '').replace(/^\//, ''))), `missing asset ${r}`);
  assert.doesNotMatch(html, /https?:\/\/(?!openapi)/, 'no remote assets in index.html');
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'AmpMap');
  assert.equal(manifest.short_name, 'AmpMap');
  assert.ok(existsSync(join(dir, 'privacy.html')), 'privacy page is deployed');
  for (const i of manifest.icons) assert.ok(existsSync(join(dir, i.src)), i.src);
  assert.ok(existsSync(join(dir, 'sw.js')));
  assert.ok(existsSync(join(dir, 'setup.html')));
  const js = readdirSync(join(dir, 'assets')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, 'assets', f), 'utf8')).join('\n');
  for (const s of ['Load check', 'QR', 'Print', 'GFCI', 'Bedroom 2 - computer, 3D printer, WiFi', 'Demo mode', 'Shore power', '12V DC fuses', 'Customers', 'Service log', 'Scan']) assert.ok(js.includes(s), `bundle contains "${s}"`);
  assert.doesNotMatch(html + js, /Panel Buddy/, 'old name is gone from the app');
  assert.doesNotMatch(js, /google-analytics|googletagmanager|gtag\(/, 'no trackers');
  assert.doesNotMatch(html + js, /lorem ipsum|TODO|FIXME/i);
});
