# ⚡ Panel Buddy

Free, no-ads web app for mapping your home's breaker panel. Installable on iPhone, Android and Windows (it's a PWA), works offline, and syncs across your devices.

- **Panels & breakers**: main panel + sub-panels, slot numbers, single/double pole, amps, label, rooms, notes. Tappable two-column panel layout like the real thing.
- **Outlets, lights, switches, fans, appliances**: room, location ("north wall by bed"), breaker, GFCI / AFCI (dropdowns), status, notes, meter readings, optional photo.
- **QR codes**: every panel, breaker and device gets a QR code that opens that record. Printable sticker sheets (1" x 2-5/8" address labels like Avery 5160, 2" squares, or plain paper).
- **Load check**: list what's plugged into each circuit (presets or custom watts). Shows amps vs. the breaker rating, warns at 80%, red over 100%. Amps = watts ÷ 120 (÷ 240 for double-pole).
- **Print & export**: panel-door directory (half page or full page, or Save as PDF), JSON backup/restore, CSV spreadsheets.
- **RVs / campers / travel trailers**: RV distribution center panel type, any number of spaces, one-column layout, shore power (30A / 50A two-leg / household), shore power load check, 12V DC fuse list, RV area names.
- **Tech / Pro mode** (for electricians and RV techs): Customers tab with customer list (search, recent / most opened / last serviced), each customer's properties and RVs, service log per visit, labels and QR stickers to leave at the job.
- **Scan**: in-app QR scanner (live camera, or take a photo). Stickers hold only a short link like `https://your-app/#/p/<panelId>`; the owner opens the full record, anyone else gets a sign-in prompt or the read-only shared copy if the owner turned sharing on.
- **Read-only share links**: a snapshot of a home's panel directory anyone with the link can view (no account). Owner can update or turn it off.
- **Search**: "breaker 7", "bathroom fan", "fuse 3", "water pump", "gfci", "dead".
- **Accounts**: email + password (Firebase Auth). Each person's data is private to them.
- **Demo mode**: until Firebase is set up (or via "Try the demo"), everything is saved in the browser with a sample home.

No ads, no analytics, no trackers, no paid services.

## Stack

Vite + plain JavaScript (no framework). Firebase **Spark (free) plan** only: Authentication + Cloud Firestore. No Cloud Functions, no Cloud Storage. Photos are shrunk on the phone to a small JPEG (about 200 KB max) and stored as a Firestore document. Firestore's offline cache keeps the app working in a garage with no signal.

```
src/firebase-config.js   <- the ONE file to edit (or use Vercel env vars)
src/main.js              UI + routes (hash routes, so QR links work anywhere)
src/store/local.js       demo mode (localStorage)
src/store/firebase.js    cloud mode (Auth + Firestore, offline cache)
src/lib/                 load math, search, presets, CSV, photo compression, sample home
firestore.rules          security rules (paste into Firebase console)
public/                  manifest, icons, service worker, setup copy page
test/                    node --test
```

Data layout in Firestore: `users/{uid}/homes`, `.../panels` (12V fuses live on the panel doc), `.../breakers` (loads live on the breaker doc), `.../devices`, `.../photos`, `.../customers`, `.../settings/profile`. Public read-only shares: `shares/{random token}` (get-only, never listable) and `sharedPanels/{panelId}` → token, so a scanned sticker can find the share.

## Setup

### 1. Firebase (free Spark plan)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project** (Google Analytics can be turned off).
2. **Build → Authentication → Get started → Email/Password → Enable → Save.**
3. **Build → Firestore Database → Create database** → pick a US location → **production mode**.
4. Firestore → **Rules** tab → replace everything with the contents of [`firestore.rules`](firestore.rules) → **Publish**.
5. **Project settings (gear) → Your apps → Web (`</>`)** → register an app (no Firebase Hosting needed) → copy the `firebaseConfig` values into [`src/firebase-config.js`](src/firebase-config.js).
   - Or set Vercel env vars instead: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
   - These web config values are not secrets; the security rules protect the data.

### 2. Vercel

1. [vercel.com/new](https://vercel.com/new) → import this repo. Framework preset **Vite** is detected; no settings to change. No serverless functions are used.
2. After the first deploy, add the Vercel domain (e.g. `panel-buddy.vercel.app`) in Firebase → **Authentication → Settings → Authorized domains**. Sign-up won't work from a domain that isn't listed.

### Local development

```
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (+ build checks after npm run build)
npm run build    # outputs dist/
```

## Notes

- **iPhone**: open in Safari → Share → **Add to Home Screen**. Scanning a QR sticker with the Camera opens the link in Safari (iOS doesn't route links into home-screen apps); sign in once in Safari too and everything is there.
- In demo mode, data lives only in that browser. Use **More → Download backup** to move it, or **Copy demo data into my account** after signing in.
- Known v1 limit: share links are snapshots (tap "Update shared copy" after changes). `sharedPanels` entries are first-come: someone who already knows a panel's ID could claim that panel's share slot before the owner shares it, so a scan of that sticker would offer their shared copy instead. The owner's private data is never exposed by this.
- Load presets are rough typical wattages. For a real check, use the watts on the device's label. The 80% line is the guideline for loads that run 3+ hours.
- Panel Buddy is a record-keeping tool, not electrical advice. Turn the breaker off and verify with a tester before working on wiring.
