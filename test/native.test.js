import test from 'node:test';
import assert from 'node:assert/strict';
import { externalUrlFor, isNativeApp } from '../src/native.js';

const APP = 'capacitor://localhost/#/h/h1/panel';

test('native: not native on the website / in node', () => {
  assert.equal(isNativeApp(), false);
});

test('native: app screens (hash routes) stay inside the app', () => {
  assert.equal(externalUrlFor('#/h/h1/more', APP), null);
  assert.equal(externalUrlFor('/#/h/h1/more', APP), null);
  assert.equal(externalUrlFor('./brand/badge.png', APP), null);
  assert.equal(externalUrlFor('', APP), null);
});

test('native: website-only pages open on the public site in Safari', () => {
  assert.equal(externalUrlFor('/privacy.html', APP), 'https://panel-buddy.vercel.app/privacy.html');
  assert.equal(externalUrlFor('/get', APP), 'https://panel-buddy.vercel.app/get');
  assert.equal(externalUrlFor('setup.html?x=1', APP), 'https://panel-buddy.vercel.app/setup.html?x=1');
});

test('native: other sites, mail and phone links go to the system', () => {
  assert.equal(externalUrlFor('https://www.brother-usa.com/x', APP), 'https://www.brother-usa.com/x');
  assert.equal(externalUrlFor('https://panel-buddy.vercel.app/#/share/abc', APP), 'https://panel-buddy.vercel.app/#/share/abc');
  assert.equal(externalUrlFor('mailto:margoittac@gmail.com', APP), 'mailto:margoittac@gmail.com');
  assert.equal(externalUrlFor('tel:5551234', APP), 'tel:5551234');
});
