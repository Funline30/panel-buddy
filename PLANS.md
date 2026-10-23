# AmpMap paid plans

## Free vs Pro
Everything AmpMap does today stays free for homeowners. No ads, ever. Pro only adds extras.

| | Free | Pro ($1.99/mo or $14.99/yr) | Company |
|---|---|---|---|
| Homes, panels, breakers, outlets, lights (unlimited) | ✓ | ✓ | ✓ |
| Floor plan, rooms, load checks, device search | ✓ | ✓ | ✓ |
| QR stickers, printing, sharing, edit codes | ✓ | ✓ | ✓ |
| Backups and spreadsheets | ✓ | ✓ | ✓ |
| Tech / Pro account (customers, service log) | ✓ (1-2 techs) | ✓ | ✓ |
| Your name on printouts (schedules, shopping lists) | | ✓ | ✓ |
| Accent colors | | ✓ | ✓ |
| Pro badge | | ✓ | ✓ |
| Priority support | | ✓ | ✓ |

Company: free for 1-2 techs. 3+ techs: 30 days free (no card needed), then $5 per tech per month,
for every tech. Family and friends: add their email to `config/vip.js` (or Vercel env `VIP_EMAILS`,
or a Firestore doc `config/vip` with an `emails` array) and they get Pro free.

The rules live in `src/lib/plans.js` (`PRO_FEATURES`, `can()`).

## Stripe objects (created Oct 22 2026, LIVE mode on FunLine Industries)
- AmpMap Pro: `prod_VUXdEK5N3I3ri3`
  - `ampmap_pro_monthly` $1.99/mo: `price_1UTYYfDiAIqGTwYd4LiAIprD`
  - `ampmap_pro_yearly` $14.99/yr: `price_1UTYYgDiAIqGTwYdfofQvt6L`
- AmpMap Company: `prod_VUXdhJSG9ixFxY`
  - `ampmap_company_seat_monthly` $5/tech/mo, 30-day trial: `price_1UTYYhDiAIqGTwYdkhgho48Z`
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
