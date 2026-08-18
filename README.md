# Salon MVP

Management system for Nigerian salons/barbershops — booking, payment-integrity
checkout, and automatic staff commission splitting. Stack and rationale are in
the companion PRD, section 8.1; this repo is the Week 0-2 scaffold from
section 8.2 of that document.

**Where the PRD actually is:** [`docs/product/`](docs/product/) —
`Salon_SaaS_PRD.docx`, the business plan, the discovery interview script,
and the one-pager. Copied in from outside the repo on 2026-08-16 so they're
version-controlled and travel with a clone; see that folder's own README for
what each document is and the caveat that they're copies, not the canonical
source.

**How this system fits together, not just how to run it:** see
[`ARCHITECTURE.md`](ARCHITECTURE.md) — the data model, why the double-booking
constraint has to live in the database, the timestamp bug that only appeared
in production, and the Paystack bug only real API calls could have caught.

## Stack

- Next.js (App Router) + TypeScript — frontend + API in one codebase
- Prisma + PostgreSQL (Supabase or Neon recommended to start)
- Paystack (Transaction Splits / subaccounts) for payment + commission
- Termii for phone-OTP login and WhatsApp/SMS reminders

## Setup (Week 0)

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Get a Postgres database.** Easiest path for MVP: create a free project
   at [supabase.com](https://supabase.com) or [neon.tech](https://neon.tech),
   copy the connection string.

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Fill in:
   - `DATABASE_URL` — from step 2
   - `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` — sandbox keys from the
     [Paystack dashboard](https://dashboard.paystack.com/#/settings/developers)
   - `TERMII_API_KEY` / `TERMII_SENDER_ID` — from [termii.com](https://termii.com)
     (also start Meta Business verification for WhatsApp now — it's usually
     the slowest step, see PRD section 8.2 note)

4. **Push the schema and generate the client**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

5. **Apply the database constraints** — required, and not optional polish:
   ```bash
   npm run db:constraints
   ```
   This adds the exclusion constraint that actually prevents two customers
   being booked into the same stylist and time. Prisma cannot express
   exclusion constraints, so it will **not** recreate this after a
   `migrate reset` — re-run it any time you rebuild the database, and on
   production before the first real booking. Without it the app still
   *appears* to work: the conflict just happens silently.

6. **Seed a test salon + owner** — edit the phone number in `prisma/seed.ts`
   to your own first, so the OTP actually reaches a phone you can read:
   ```bash
   npm run prisma:seed
   ```

7. **Run it**
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000/login`, log in with the phone number from
   the seed script, and you should land on `/dashboard`. Also check
   `http://localhost:3000/api/health` to confirm Prisma can reach the
   database.

## What's built

Every feature in the PRD's MVP scope (sections 5.1–5.5) has a first pass
implemented. Pages (all under `/dashboard` unless noted):

- **Auth** — phone-OTP login (`/login`), signed-cookie sessions
  (`src/lib/session.ts`, `src/lib/auth.ts`), owner-only write guard
  (`src/lib/require-owner.ts`)
- **Services** (`/dashboard/services`) — add/remove, price + duration
- **Staff** (`/dashboard/staff`) — add/remove, set and edit each person's
  commission rule (percent / flat / chair rental), set up their Paystack
  payout subaccount
- **Opening hours** (`/dashboard/hours`) — per-weekday open/close times in
  Lagos time; unchecking a day closes it. A salon that has never set hours
  falls back to 9:00–19:00 rather than appearing closed forever.
- **Calendar** (`/dashboard/calendar`) — day view grouped by staff, walk-in
  quick-add, confirm/no-show/cancel actions, and an inline reschedule editor
  (date/time/stylist) — protected by the same exclusion constraint as every
  other write path, so a reschedule into an occupied slot gets the same 409
  rather than silently double-booking it
- **Customer booking** (`/book/[salonId]`, public, no login) — pick a
  service/stylist/time from real availability, confirm with just a phone
  number; this is the page the WhatsApp booking link opens
- **Checkout** (`/dashboard/checkout/[id]`) — cash, bank transfer, or
  Paystack; flags under-collected payments; the only path that can mark an
  appointment `COMPLETED`
- **Reports** (`/dashboard/reports`) — daily booked vs. collected, by
  method, flagged transactions
- **Earnings** (`/dashboard/earnings`) — a staff member's own running total
- **Reminders** — `/api/cron/send-reminders`, wired to run every 15 minutes
  via `vercel.json` once deployed
- **Offline** — two layers. Walk-ins and cash/transfer checkouts queue in
  IndexedDB (`src/lib/offline-db.ts`, `src/lib/offline-sync.ts`) and auto-sync
  when connectivity returns, with a banner in `src/app/dashboard/layout.tsx`.
  A service worker (`public/sw.js`) caches the app shell so the dashboard
  still *opens* during an outage — without it the queue is useless on a cold
  load, because the app never renders. `/api` is never cached: stale
  availability or stale takings would be worse than an honest failure.
- **Installable** — `public/manifest.webmanifest` lets the dashboard install
  to an Android home screen with no app-store review

Known gaps worth knowing about before you rely on this:
- **App icons don't exist yet.** `manifest.webmanifest` points at
  `/icons/icon-192.png`, `icon-512.png`, and `icon-maskable-512.png`. Until
  those files are added, Android may not offer the "Add to home screen"
  prompt. Deliberately left until the product has a name and a mark — the
  service worker and offline behaviour work regardless.
- Service worker registration is **production-only** (`register-sw.tsx`), so
  offline behaviour won't appear under `npm run dev`. Test it with
  `npm run build && npm start`, then use DevTools → Network → Offline.
- ~~Editing a staff member's commission rule doesn't update their existing
  Paystack subaccount split automatically~~ **Fixed** — every checkout now
  recomputes the split from the current commission rule and sends it to
  Paystack per-transaction, so the subaccount's stored percentage no longer
  matters for correctness. See `ARCHITECTURE.md`.
- ~~Hard-deleting a staff member with existing bookings/payments will fail on
  purpose (no soft-delete/deactivate flow yet)~~ **Fixed** — staff now have
  an `active` flag. Deactivating (Staff page → Deactivate) keeps their
  history intact but drops them from booking, dropdowns, and login; hard
  delete still exists for staff with no history at all.
- Opening hours are salon-wide, not per-staff — one stylist working a
  different shift from the rest isn't modelled yet (PRD keeps per-staff
  schedules out of MVP)

## What has actually been verified

Verified against real infrastructure, not just typechecked — these are facts,
not intentions:

- `npx tsc --noEmit` and `npm run build` — clean, all 28 routes generate
- `npm test` — 33 unit tests passing (overlap rules, reconciliation logic,
  availability computation, Lagos time handling)
- **Database:** migrations applied, exclusion constraint applied and
  confirmed present in `pg_constraint`, against the live Supabase project.
- **The double-booking claim, proven, not asserted:** `npm run
  test:concurrency` fires 8 simultaneous `appointment.create()` calls at the
  identical staff+slot, no pre-check, straight through Prisma. Exactly 1
  succeeds, 7 are rejected by Postgres itself (SQLSTATE `23P01`, naming
  `appointment_no_overlap`), exactly 1 row lands in the table. See
  `src/lib/overlap.concurrency.test.ts` and `ARCHITECTURE.md`.
- **Paystack:** the secret key is valid (confirmed against
  `/transaction/totals`). `createStaffSubaccount` and
  `initializeSplitTransaction` both work against Paystack's real test
  environment — a real subaccount was created, bank-verified, and a real
  split transaction was initialized and verified against it. This is also
  what caught a live bug: the placeholder customer email used a `.local`
  domain, which Paystack's validator rejects outright ("Invalid Email
  Address Passed") — every Paystack checkout in the app would have failed
  on this before it was found and fixed.

**Not yet verified:** Termii OTP/SMS delivery (blocked on sender-ID
approval — see `SETUP-CHECKLIST.md`), the offline sync round trip against a
real dropped connection, and the reminder cron. The QA checklist below
covers all three manually.

Two things worth knowing about *how* the database and Paystack items above
got verified, both recorded in `ARCHITECTURE.md`: a Postgres volatility
subtlety that broke the exclusion constraint twice in two different ways
before it applied cleanly, and a `next build` failure
(`/checkout/paystack-callback` needed a Suspense boundary) that would have
silently blocked the Vercel deploy — caught only because the build was
actually run, not just `tsc`.

## QA checklist (run this before showing it to a real salon)

1. `npm install`, then `npx prisma migrate dev` — should complete with no errors.
2. Log in via `/login` with the seeded phone number.
3. Add a service and a staff member (with a commission rule) on their
   respective pages, and set your opening hours on `/dashboard/hours`.
   Then confirm the booking page only offers times inside those hours, and
   offers nothing at all on a day you marked closed.
4. Open `/book/[salonId]` in an incognito window (find `salonId` on the
   dashboard's booking-link line) and book an appointment as a "customer."
5. Confirm the appointment appears on `/dashboard/calendar`, then try
   booking the exact same slot again — it should be rejected (double-booking guard).
   Then test the case that actually bites: fire two bookings for the same slot
   at once and confirm exactly one succeeds and the other gets a 409, not a
   500. This only works if `npm run db:constraints` has been applied —
   sequential rejection passes with or without it, so it proves nothing on
   its own.
6. Add a walk-in from the calendar page.
7. Check out one appointment with Cash for less than the service price —
   confirm it shows up flagged on `/dashboard/reports`.
8. Check out another appointment with Paystack (test-mode card) — confirm
   the redirect, the callback page, and that it lands as `COMPLETED`. This
   exact call was broken until it was tested live: the placeholder customer
   email used a `.local` domain, which Paystack's API rejects outright
   ("Invalid Email Address Passed"), and there was no error handling around
   the call, so the failure surfaced as a raw 500 rather than a usable
   message. Both are fixed — this step is what would have caught it earlier.
9. Log in as the staff member added in step 3 and confirm `/dashboard/earnings`
   shows their share from step 8.
10. Turn off wifi, add a walk-in and do a cash checkout, turn wifi back on,
    confirm the offline banner clears and the data appears after a refresh.
11. Manually hit `/api/cron/send-reminders` with the `CRON_SECRET` header
    once you have a booking in the next ~24h/2h window — confirm a
    WhatsApp/SMS actually arrives via Termii.

## Deploy checklist

1. Push this repo to GitHub.
2. Import it into [Vercel](https://vercel.com/new).
3. Add every variable from `.env.example` in Vercel's Project Settings →
   Environment Variables, using your real (not test) Paystack/Termii keys
   once you're ready to go live, and set `NEXT_PUBLIC_APP_URL` to your real
   deployed URL.
4. Vercel picks up `vercel.json` automatically for the reminder cron —
   confirm it under Project Settings → Cron Jobs after the first deploy.
   (Note: frequent/every-15-minutes cron schedules may require a paid
   Vercel plan; check your plan's cron limits.)
5. Run your production database's migration: `npx prisma migrate deploy`
   (not `migrate dev`) against the production `DATABASE_URL`, then apply the
   constraints with `npm run db:constraints` against that same URL.
   `migrate deploy` does not create the exclusion constraint — if you skip
   this, production will accept double bookings silently.
6. Smoke-test the QA checklist above against the live URL before onboarding
   a real salon.

## Onboarding your first pilot salon

This is the one item on the task list that's genuinely yours, not code —
it's the outcome of the discovery interviews (see the companion interview
script) plus a working, deployed app. When you're ready: create their Salon
+ owner Staff row (via `prisma studio` for now — there's no self-serve salon
signup in MVP scope), walk them through services/staff/payouts once
together, then hand them the booking link.

## Data model notes

- `TransactionSplit` has one row per party paid out of a `Transaction`
  (owner + staff), so digital payments (settled via Paystack subaccounts)
  and cash payments (settled via an internal ledger entry) share the same
  reporting shape — this is what powers the daily reconciliation summary
  and the "flagged" no-matching-payment check.
- `Transaction.isFlagged` is the field the payment-integrity feature turns
  on when an appointment is marked complete without a matching payment —
  this is the core differentiator from the PRD, so don't let anything set
  an appointment to `COMPLETED` without going through the checkout path
  that creates a `Transaction`.
