# Architecture

What README.md tells you how to run; this tells you how it fits together and
why the load-bearing decisions were made. Written after the fact, from the
code and the commit history — not aspirational.

## The one sentence version

A multi-tenant Next.js app where the database enforces the one guarantee the
product actually promises (no double-booking), payments settle directly to
the salon via Paystack subaccounts rather than passing through this app, and
every write survives the connection dropping.

## Data model

`prisma/schema.prisma` is the source of truth; this is the shape of it and
why it's shaped that way.

```
Salon ──┬── Staff ──── CommissionRule
        ├── Customer
        ├── Service
        ├── BusinessHours
        └── Appointment ──┬── (staffId, customerId, serviceId)
                           └── Transaction ── TransactionSplit[]
```

- **Salon is the tenant root.** Everything else hangs off `salonId`. There is
  no cross-salon query anywhere in the app — each API route scopes to
  `session.salonId` from the logged-in staff member's session.
- **Customer is salon-owned, not global.** `@@unique([salonId, phone])` — the
  same phone number is a different `Customer` row per salon. This is
  deliberate: PRD's core differentiator is that client relationships belong
  to the salon, not to whichever stylist served them. A departing stylist
  cannot take the customer record with them because it was never theirs.
- **Transaction is 1:1 with Appointment**, created only through checkout.
  `Appointment.status` can only become `COMPLETED` via
  `POST /api/transactions` or the Paystack verify webhook — see
  `EDITABLE_STATUSES` in `src/app/api/appointments/[id]/route.ts`, which
  deliberately excludes `COMPLETED` so there's no side door.
- **TransactionSplit** exists so a cash payment and a Paystack split payment
  produce the same shape for reporting — one row per party paid (owner,
  staff), whether the money moved through Paystack or was recorded manually.

## The one thing the database enforces, not the app

`prisma/sql/001_appointment_no_overlap.sql` — an exclusion constraint, not a
unique index, because the thing being prevented is a *range* overlap
(`[startTime, endTime)`), not an exact match:

```sql
EXCLUDE USING gist (
    "staffId" WITH =,
    appointment_slot_range("startTime", "endTime") WITH &&
) WHERE (status IN ('BOOKED', 'CONFIRMED', 'COMPLETED'))
```

**Why this exists instead of an application-level check:** every write path
already calls `isSlotAvailable()` before inserting, which reads existing
appointments and checks for overlap. That's a check-then-write with nothing
atomic between the two statements — two concurrent requests can both read
"free" before either has written, and both succeed. No error, no signal,
just two customers booked into the same chair.

This is not hypothetical for this product specifically: the offline sync
queue (`src/lib/offline-sync.ts`) replays queued writes in a burst on
reconnect, which is exactly the concurrency pattern that triggers the race.

`isSlotAvailable()` still runs first in every route — it's the friendly
pre-check that returns a clean 409 in the ordinary case. The constraint is
what happens when two requests get past that check at the same instant; it's
the guarantee, not the check.

**Proof, not assertion:** `src/lib/overlap.concurrency.test.ts` fires 8
simultaneous inserts for an identical slot straight at Prisma, with no
pre-check, and asserts exactly one survives. Skipped by default (it needs a
real database); run it with `npm run test:concurrency`. See that file's own
header for why it's structured the way it is.

**A trap worth knowing before touching this constraint again:** Postgres's
built-in `tstzrange()` is volatility `STABLE`, not `IMMUTABLE`, so it cannot
appear in an index expression directly. The wrapper function
(`appointment_slot_range`) has to be `LANGUAGE plpgsql`, not `LANGUAGE sql`  —
a `sql`-language wrapper gets inlined by the planner, which exposes the raw
`STABLE` call underneath regardless of the wrapper's own declared
volatility. Both of these were discovered by applying the SQL against a live
database, not by reading documentation; see the comments in the migration
file for the full story, including the timestamp-vs-timestamptz issue that
was really behind the first failure.

## Time

Everything in `src/lib/lagos-time.ts` and `src/lib/day-availability.ts`
assumes `Africa/Lagos` = UTC+1, fixed, no DST — which is true, so a constant
offset is exact rather than an approximation, and the app needs no timezone
database.

This module exists because the original slot-generation code used
`date.setHours()`, which is the *server's* local time. Correct by accident on
a developer's Lagos laptop; wrong by exactly one hour on Vercel, which runs
UTC. That bug would only ever have appeared in production. See the comment
block at the top of `day-availability.ts`.

`Appointment.startTime`/`endTime` are `@db.Timestamptz(3)`, not the Prisma
default bare `timestamp`. This isn't cosmetic — it's required for the
exclusion constraint to avoid an implicit `timestamp -> timestamptz` cast,
which is itself `STABLE` and would be rejected by the same index-expression
rule above.

## Money

Everything is integer kobo or `Decimal` in Prisma — never a JS float for a
naira amount. `priceNaira` on `Service` is actually stored as kobo-precision
`Decimal(10,2)`; the name is legacy from before that was tightened and is
worth renaming eventually, not urgently.

## Availability

`src/lib/day-availability.ts` is pure — no database, no clock read internally
(`now` is always passed in), no Prisma import. It answers "what slots are
bookable for this service on this date" given the salon's hours, the
service's duration, and a list of already-busy intervals. The API route
(`src/app/api/public/availability/route.ts`) does exactly one thing this
module doesn't: fetch the day's appointments and hours from the database,
once, then hand them to this function.

That "once" matters. The route used to call `isSlotAvailable()` per candidate
slot — one query per ~20-minute slot in the day, on a public unauthenticated
endpoint, for customers on 2G. It's now one query for the day's appointments
and one for hours, computed in memory from there.

**Business hours fallback:** a salon with zero `BusinessHours` rows falls
back to 09:00–19:00 rather than reading as permanently closed — see
`DEFAULT_HOURS` in `day-availability.ts`. This exists so shipping the
per-salon-hours feature didn't silently stop every existing salon from
taking bookings the moment it deployed. A salon that *has* configured hours
is closed on any day it didn't list — that's deliberate, not a bug: a
missing weekday row on a salon with other rows configured means the owner
chose not to open that day.

## Payments

`src/lib/paystack.ts` is a thin wrapper — three calls, no SDK. The design
choice that matters: **this app never holds customer money.** A charge is
initialized with `subaccount: staff.paystackSubaccountCode`, so Paystack
itself splits the payment and settles the staff's share directly to their
own bank account on the normal settlement cycle. The commission-split logic
lives in Paystack's infrastructure, not in a ledger this app has to
reconcile and pay out later.

**A live bug worth remembering the shape of:** the placeholder customer
email (Paystack requires one even for a phone-only flow) originally used a
`.local` domain. Paystack's validator rejects that outright — `.local` is
RFC 6762 mDNS space, not a real TLD — so every single checkout would have
failed with "Invalid Email Address Passed." This was invisible to `tsc`,
invisible to `next build`, invisible to every unit test, because none of
them call the real Paystack API. It was only found by actually calling
`createStaffSubaccount`/`initializeSplitTransaction` against Paystack's live
sandbox. The general lesson, not just the specific fix: anything that
depends on a third party's validation rules needs to be tested against that
third party at least once, because no amount of local type-checking catches
it.

## Offline

`src/lib/offline-db.ts` (Dexie/IndexedDB) queues writes made while offline;
`src/lib/offline-sync.ts` flushes the queue on reconnect. This covers "the
app is open and the connection drops mid-action."

It does **not** cover "the connection is down before the app loads" — that
needed a service worker (`public/sw.js`) caching the app shell, added later
in the project. The two layers are deliberately separate concerns: the
service worker gets you a working page; Dexie gets your walk-in or cash
checkout saved once you're looking at it.

**What the service worker deliberately never caches:** anything under `/api`.
A cached availability response or a cached daily total would be actively
wrong, and wrong-but-present is worse than absent — a customer booking
against a stale slot list gets a 409 they don't understand; an owner reading
a stale reconciliation number trusts a figure that's already changed. See
the comment block at the top of `public/sw.js`.

## What's missing, honestly

- **Real-time availability**, not just no-double-booking. The constraint
  prevents two people booking the same slot; it says nothing about a slot
  someone else is mid-way through booking right now. Fine at pilot volume,
  worth revisiting if concurrent booking volume grows.
- **WhatsApp.** SMS-only today, gated on Meta Business verification — see
  `SETUP-CHECKLIST.md`.
- **Commission-rule / Paystack-subaccount drift.** Editing a staff member's
  commission rule in the app doesn't push the change to their existing
  Paystack subaccount split — the two can disagree until someone notices.
- **No architecture-level test for the reminder cron, offline sync, or
  Termii integration** — these are described in README's QA checklist as
  manual steps, not automated.
