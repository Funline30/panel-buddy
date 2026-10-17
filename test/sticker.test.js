import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_STORE_URL, PLAY_STORE_URL, GET_URL, PUBLIC_APP_URL, detectPlatform, getTarget, storeRows, stickerQrTarget,
  cleanInstalledBy, installedByText, installedByDefault, STICKER_SIZES, stickerSize, stickerCopy,
} from '../src/lib/sticker.js';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadOld: 'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipadNew: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  samsungTab: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
};

test('sticker: store URLs start empty and the printed link is the public /get', () => {
  assert.equal(APP_STORE_URL, '');
  assert.equal(PLAY_STORE_URL, '');
  assert.equal(GET_URL, 'https://panel-buddy.vercel.app/get');
  assert.equal(PUBLIC_APP_URL, 'https://panel-buddy.vercel.app');
});

test('sticker: device detection', () => {
  assert.equal(detectPlatform(UA.iphone), 'ios');
  assert.equal(detectPlatform(UA.ipadOld), 'ios');
  assert.equal(detectPlatform(UA.ipadNew, { platform: 'MacIntel', maxTouchPoints: 5 }), 'ios', 'iPadOS looks like a Mac but has touch');
  assert.equal(detectPlatform(UA.ipadNew, { platform: 'MacIntel', maxTouchPoints: 0 }), 'other', 'a real Mac');
  assert.equal(detectPlatform(UA.android), 'android');
  assert.equal(detectPlatform(UA.samsungTab), 'android');
  assert.equal(detectPlatform(UA.windows), 'other');
  assert.equal(detectPlatform(''), 'other');
  assert.equal(detectPlatform(undefined), 'other');
});

test('sticker: /get target while the stores are empty = web app, no redirect', () => {
  for (const p of ['ios', 'android', 'other']) assert.deepEqual(getTarget(p), { kind: 'web', url: PUBLIC_APP_URL, redirect: false });
  const rows = storeRows('other');
  assert.deepEqual(rows.map((r) => r.text), ['iPhone app coming soon', 'Android app coming soon']);
  assert.ok(rows.every((r) => r.soon));
  assert.equal(storeRows('android')[0].key, 'android', 'your own phone first');
});

test('sticker: /get target once the store URLs are filled in = auto redirect', () => {
  const links = { appStore: 'https://apps.apple.com/app/id1', playStore: 'https://play.google.com/store/apps/details?id=x' };
  assert.deepEqual(getTarget('ios', links), { kind: 'appstore', url: links.appStore, redirect: true });
  assert.deepEqual(getTarget('android', links), { kind: 'play', url: links.playStore, redirect: true });
  assert.deepEqual(getTarget('other', links), { kind: 'web', url: PUBLIC_APP_URL, redirect: false });
  // only one store live: the other phone still gets the web app
  assert.equal(getTarget('android', { appStore: links.appStore, playStore: '' }).redirect, false);
  assert.equal(storeRows('ios', links)[0].text, 'Get it on the App Store');
  assert.equal(storeRows('ios', { appStore: '', playStore: links.playStore })[1].text, 'Get it on Google Play');
});

test('sticker: QR target = shared copy when sharing is on, else /get', () => {
  const shareUrl = (t) => `https://x.test/#/share/${t}`;
  assert.deepEqual(stickerQrTarget({ id: 'h1' }, { shareUrl }), { kind: 'get', url: GET_URL });
  assert.deepEqual(stickerQrTarget({ id: 'h1', shareToken: '' }, { shareUrl }), { kind: 'get', url: GET_URL });
  assert.deepEqual(stickerQrTarget({ id: 'h1', shareToken: 'abc123' }, { shareUrl }), { kind: 'share', url: 'https://x.test/#/share/abc123' });
  assert.deepEqual(stickerQrTarget({ id: 'h1', shareToken: 'abc123' }, { shareUrl, prefer: 'get' }), { kind: 'get', url: GET_URL });
  assert.equal(stickerQrTarget(null).kind, 'get');
  assert.equal(stickerQrTarget({ shareToken: 'z' }).url, 'https://panel-buddy.vercel.app/#/share/z');
  assert.match(stickerCopy('share').scan, /see this panel/);
  assert.match(stickerCopy('get').scan, /get the app/);
});

test('sticker: Installed by text', () => {
  assert.equal(installedByText(null), '');
  assert.equal(installedByText({}), '');
  assert.equal(installedByText({ company: '  ', phone: '' }), '');
  assert.equal(installedByText({ company: 'Bright Line Electric', phone: '(254) 555-0142' }), 'Installed by: Bright Line Electric · (254) 555-0142');
  assert.equal(installedByText({ company: 'Bright Line   Electric ' }), 'Installed by: Bright Line Electric');
  assert.equal(installedByText({ phone: '254-555-0142' }), 'Installed by: 254-555-0142');
  assert.deepEqual(cleanInstalledBy({ company: 'A', phone: '', extra: 1 }), { company: 'A' });
  assert.equal(cleanInstalledBy('nope'), null);
  assert.equal(cleanInstalledBy({ company: 'x'.repeat(100) }).company.length, 60);
});

test('sticker: Installed by default (home first, then Tech/Pro last value, old data fine)', () => {
  const settings = { installedBy: { company: 'Bright Line Electric', phone: '555' } };
  assert.equal(installedByDefault({ id: 'old' }, {}, false), null, 'old home, no field');
  assert.equal(installedByDefault({ id: 'old' }, settings, false), null, 'personal accounts get no remembered default');
  assert.deepEqual(installedByDefault({ id: 'old' }, settings, true), settings.installedBy, 'Tech/Pro: last used');
  assert.deepEqual(installedByDefault({ id: 'h', installedBy: { company: 'Own Co' } }, settings, true), { company: 'Own Co' }, 'home wins');
  assert.equal(installedByDefault({ id: 'h', installedBy: null }, settings, true), null, 'a deliberate blank stays blank');
  assert.equal(installedByDefault(undefined, undefined, true), null);
});

test('sticker: sizes', () => {
  assert.deepEqual(STICKER_SIZES.map((s) => s.value), ['2x3', '4x6']);
  assert.deepEqual([stickerSize('2x3').w, stickerSize('2x3').h], [3, 2]);
  assert.deepEqual([stickerSize('4x6').w, stickerSize('4x6').h], [4, 6]);
  assert.equal(stickerSize('nope').value, '4x6');
});
