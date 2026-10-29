# AI_HANDOFF — Breakerly (repo: panel-buddy)

_Shared handoff file for any AI working in this repo. Last updated: 2026-10-29 by Tab._

## READ ME FIRST — rules for any AI working here

This file is the shared notebook between Caleb's AIs (Tab and Perplexity, and anyone else). It is how we talk to each other through the repo.

1. **Read this whole file before you start**, then `git log --oneline -10` on main. The Log at the bottom says what the last AI did and what's left.
2. **When you're done, append a dated entry to the Log** (newest at the bottom): who (Tab or Perplexity), what changed, commit SHAs, what's left. Update "Current state" and "Open / next" if they changed.
3. **Commit as** `Funline30 <Funline30@users.noreply.github.com>` (author and committer).
4. **Never commit secrets** (keys, tokens, passwords, service-account JSON). Env vars live in Vercel; name them only, never paste values.
5. **Run the tests before pushing**: `npm test` (and `npm run build`). Don't push a red build.
6. **Don't push changes to main that remove or hide a feature without Caleb's OK.** When unsure, use a branch and ask him. main deploys straight to the live site.
7. **Android / Google Play uploads: Closed testing – Alpha track only.** Never production, open or internal testing unless Caleb says so.
8. **Pricing: no lifetime / one-time prices. Monthly + yearly only** (Caleb, Oct 29 2026). Past lifetime buyers stay honored; just don't sell it.
9. If something needs Caleb (SQL to run, a key in Vercel, a click in a store console), write it under "Open / next" starting with **Caleb:**.

## What this app is

Breakerly (formerly AmpMap, before that Panel Buddy): free, no-ads web app (PWA) for mapping a home's breaker panel. Panels and breakers, outlets/lights/devices, rooms and floor plan, QR stickers, load checks, sharing and edit codes, electrician QR, AI panel scan (Pro). Owner: Caleb Margoitta (Funline30).

- Website: https://breakerly.com (also https://panel-buddy.vercel.app)
- Android: `com.funline30.ampmap` (Play app shell around the website), Google Play Closed testing. Store name and icon still say AmpMap.
- iPhone: in Apple review since the Oct 22 resubmit.
- Prices (web checkout only; hidden inside the native apps): Free · Pro $1.99/mo or $14.99/yr (Caleb kept $14.99, Oct 29) · Company: free for 1–2 techs, $5/mo per tech after 2 (30-day trial). Details in `PLANS.md`.

## Stack

- Vite + vanilla JS front end (`src/`), Vercel functions in `api/` (billing, AI scan). Vercel project: **panel-buddy** (main → production).
- Firebase Auth + Firestore for data (`firestore.rules` in repo; Firebase project id "panel-buddy" per Tab's notes, unverified). No Supabase.
- Stripe env (Vercel): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Prices are found by Stripe lookup key (`ampmap_pro_monthly`, `ampmap_pro_yearly`, `ampmap_company_seat_monthly`). `STRIPE_PRICE_LIFETIME` still exists in Vercel but lifetime is no longer sold; the webhook keeps honoring past lifetime buyers.
- Other env (Vercel): `GEMINI_API_KEY` (AI panel scan). **`FIREBASE_SERVICE_ACCOUNT` is missing in Vercel** (checked Oct 29) — it's how a paid plan gets saved to the buyer's account.
- Free Pro for family/owner: `config/comp.js` / `config/vip.js` (or env `COMP_EMAILS` / `VIP_EMAILS`).
- Native: Capacitor iPhone app (`native/`, appName still "AmpMap").
- Tests: `npm test` (`node --test test/*.test.js`); build: `npm run build`.

## Branches that matter

- **main**: the live website (Vercel production). Head e851ad2.
- **ios-capacitor**: iPhone app (d914130, Oct 17).
- The other branches are old feature branches; ignore unless the Log says otherwise.

## Current state (as of 2026-10-29)

- main e851ad2 (Oct 29): Lifetime Pro removed. Pro is monthly ($1.99) or yearly ($14.99) only. Live on breakerly.com.
- 6b4fac8 (Oct 28): Android app-link file carries Google Play's signing key (full-screen fix).
- db4c065 (Oct 27): AI panel scan (Pro), electrician QR, "apps coming soon" banner, AmpMap → Breakerly on the website.
- Android on Play Closed testing; iPhone waiting on Apple.

## Open / next

- **Caleb:** add `FIREBASE_SERVICE_ACCOUNT` in Vercel (panel-buddy). Until then a paid plan may not stick to the buyer's account.
- **Caleb:** one real Pro purchase to prove it unlocks.
- **Caleb:** Google Play: apply for production once the tester days are up (~Nov 1).
- Apple review result (waiting since Oct 22).
- Rename AmpMap → Breakerly inside the phone apps and store listings (Android name/icon, `native/` appName). Waits on Apple's approval.
- README.md still says "AmpMap"; update the title/name when convenient.

## Log

_Append below. Format: `### YYYY-MM-DD — Tab|Perplexity` then bullets: what changed, commit SHAs, what's left._

### 2026-10-29 — Tab
- Created this AI_HANDOFF.md and added a pointer line at the top of README.md (docs only, no code change; this commit).
- Earlier today (Tab): e851ad2 stopped selling Lifetime Pro (monthly + yearly only).
- Left: see "Open / next" above.
