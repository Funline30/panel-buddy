import test from 'node:test';
import assert from 'node:assert/strict';
import { printMode, isIos, isStandalone } from '../src/print.js';

const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', platform: 'iPhone', maxTouchPoints: 5 };
const MAC = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 };
const mmNo = () => ({ matches: false });
const mmStandalone = (q) => ({ matches: q.includes('standalone') });
const win = (extra = {}) => ({ print() {}, location: { search: '' }, localStorage: { getItem: () => null }, matchMedia: mmNo, ...extra });

test('print: iPhone home-screen app (navigator.standalone) makes a PDF', () => {
  assert.equal(printMode({ nav: { ...IPHONE, standalone: true }, w: win() }), 'pdf');
});
test('print: iPhone home-screen app (display-mode: standalone) makes a PDF', () => {
  assert.equal(printMode({ nav: IPHONE, mm: mmStandalone, w: win({ matchMedia: mmStandalone }) }), 'pdf');
});
test('print: iPhone Safari tab keeps the normal print dialog', () => {
  assert.equal(printMode({ nav: IPHONE, w: win() }), 'print');
});
test('print: desktop keeps window.print()', () => {
  assert.equal(printMode({ nav: MAC, w: win() }), 'print');
  assert.equal(isIos(MAC), false);
});
test('print: iPad (MacIntel + touch) home-screen app makes a PDF', () => {
  assert.equal(printMode({ nav: { ...MAC, maxTouchPoints: 5, standalone: true }, w: win() }), 'pdf');
});
test('print: inside the iPhone app (Capacitor) makes a PDF', () => {
  assert.equal(printMode({ nav: IPHONE, w: win({ Capacitor: { isNativePlatform: () => true } }) }), 'pdf');
});
test('print: ?pdf=1 forces the PDF path (testing)', () => {
  assert.equal(printMode({ nav: MAC, w: win({ location: { search: '?demo=1&pdf=1' } }) }), 'pdf');
  assert.equal(isStandalone({}, null), false);
});
