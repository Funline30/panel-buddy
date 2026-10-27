# Breakerly paid plans (formerly Breakerly)

## Free vs Pro
Everything Breakerly does today stays free for homeowners. No ads, ever. Pro only adds extras.

| | Free | Pro ($1.99/mo, $14.99/yr or $19.99 once) | Company |
|---|---|---|---|
| Homes, panels, breakers, outlets, lights (unlimited) | ✓ | ✓ | ✓ |
| Floor plan, rooms, load checks, device search | ✓ | ✓ | ✓ |
| QR stickers, printing, sharing, edit codes | ✓ | ✓ | ✓ |
| Backups and spreadsheets | ✓ | ✓ | ✓ |
| Tech / Pro account (customers, service log) | ✓ (1-2 techs) | ✓ | ✓ |
| AI panel scan (one photo -> breakers, amps, labels) | 3 to try | 20 / month | 20 / month |
| Branded PDF panel schedules (printing stays free) | | ✓ | ✓ |
| Your name on printouts (schedules, shopping lists) | | ✓ | ✓ |
| Accent colors | | ✓ | ✓ |
| Pro badge | | ✓ | ✓ |
| Priority support | | ✓ | ✓ |

Company: free for 1–2 techs. 3+ techs: $5/mo for each tech after 2, with a 30-day free trial
(no card needed). So 3 techs = $5/mo, 4 techs = $10/mo, 10 techs = $40/mo (Caleb, Oct 22 2026).
In Stripe the subscription quantity is techs − 2 (minimum 1 once there are 3+ techs), on the same
$5 per-unit price. A company changes its tech count on the Plans screen (`POST /api/billing/seats`),
which sets the quantity the same way; going back to 1–2 techs means cancelling in Manage plan.
Family and friends: add their email to `config/vip.js` (or Vercel env `VIP_EMAILS`,
or a Firestore doc `config/vip` with an `emails` array) and they get Pro free.

The rules live in `src/lib/plans.js` (`PRO_FEATURES`, `can()`).

## Stripe objects (created Oct 22 2026, LIVE mode on FunLine Industries)
- Breakerly Pro: `prod_VUXdEK5N3I3ri3`
  - `ampmap_pro_monthly` $1.99/mo: `price_1UTYYfDiAIqGTwYd4LiAIprD`
  - `ampmap_pro_yearly` $14.99/yr: `price_1UTYYgDiAIqGTwYdfofQvt6L`
- Breakerly Company: `prod_VUXdhJSG9ixFxY`
  - `ampmap_company_seat_monthly` $5 per billed tech per month (quantity = techs − 2), 30-day trial:
    `price_1UTYYhDiAIqGTwYdkhgho48Z`
- Customer portal settings: `bpc_1UTYYoDiAIqGTwYd133kzVT4`

The code finds prices by lookup key, so it works with test keys too: with a test key, the first
checkout creates the same products and prices in test mode by itself.

## Setup (Caleb, about 10 minutes)
1. Stripe > Developers > API keys: copy the Secret key (start with the test one, `sk_test_...`).
2. Vercel > panel-buddy > Settings > Environment Variables, add:
   - `STRIPE_SECRET_KEY` = that key
   - `FIREBASE_SERVICE_ACCOUNT` = Firebase console > Project settings > Service accounts >
     Generate new private key > open the file and paste ALL of it as the value
3. Stripe > Developers > Webhooks > Add endpoint:
   - URL: `https://panel-buddy.vercel.app/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy its Signing secret (`whsec_...`) into Vercel as `STRIPE_WEBHOOK_SECRET`.
4. Redeploy in Vercel. Test with card 4242 4242 4242 4242, any future date, any CVC.
5. Going live: swap both Stripe values for the live key and a live webhook's secret, redeploy.

With nothing set, the site works as before and the plans screen says "Coming soon".

## Apps
The web checkout is hidden inside the iPhone app (Capacitor) and the Android Play app (TWA),
because Apple and Google require their own in-app purchase there. Pro bought on the web
(and VIP) still shows in the apps.

## Firestore rules
No change needed. Plans are stored at `billing/{uid}` by the server only; the existing
catch-all rule keeps that collection closed to the app, so nobody can give themselves Pro.


## Lifetime Pro ($19.99 once) - added Oct 27 2026
- Checkout `mode=payment` with the price in env `STRIPE_PRICE_LIFETIME` (or a price with lookup key
  `breakerly_pro_lifetime`). The code never creates this price itself.
- Caleb: Stripe > Product catalog > Breakerly/AmpMap Pro > Add another price > One-off, $19.99 USD
  (lookup key `breakerly_pro_lifetime`). Copy its `price_...` id into Vercel env `STRIPE_PRICE_LIFETIME`, redeploy.
  Until then the Lifetime card says "Coming soon".
- The webhook (`checkout.session.completed`, mode payment, metadata lifetime=true) stores
  `billing/{uid}` = `{ plan: 'pro', interval: 'lifetime' }`. The status check also finds a lifetime
  payment in Stripe (PaymentIntent metadata) if the webhook hasn't run.

## AI panel scan - added Oct 27 2026
- `POST /api/scan-panel` (signed-in, Firebase ID token). Gemini reads one photo of the panel directory;
  the person reviews the breakers in the same grid as the free on-phone scan before anything is saved.
- Env: `GEMINI_API_KEY` in Vercel > panel-buddy > Settings > Environment Variables (Production), then redeploy.
  Without it the app shows "AI scan coming soon". Optional `GEMINI_MODEL` (tried first; then
  gemini-flash-latest and named fallbacks, same list as Runs Ledger).
- Allowance: Pro / Company / VIP / Lifetime 20 scans a month, free accounts 3 scans in total, owner
  accounts unlimited. Usage is stored server-side at `scanUsage/{uid}` (needs `FIREBASE_SERVICE_ACCOUNT`;
  without it the count is per server instance). Rate limit 15 per user per hour; photo cap 4 MB.
- No Firestore rules change: `scanUsage` is written by the server only and the catch-all rule keeps it closed.

## Owner accounts (always Pro, unlimited AI scans)
`config/comp.js` (`COMP_EMAILS`) plus Vercel env `COMP_EMAILS` (comma-separated; `OWNER_EMAILS` and
`FREE_ACCOUNT_EMAILS` are read too). Seeded with margoittac@gmail.com, margoitta2002@gmail.com,
caleb.margoitta2002@gmail.com, funlineprints@gmail.com.

## Store apps
Prices and buy buttons are hidden inside the iPhone app and the Android Play app; checkout is web only.
