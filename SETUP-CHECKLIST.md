# What I need from you before development can continue

Everything in the codebase so far has been typechecked, built, and unit-tested —
but **nothing has ever talked to a database, Paystack, or a real phone.** The
items below are the ones only you can do: they need your identity, your business
details, or your money.

Ordered so the slowest queues start first and the biggest blocker clears soonest.

| # | Task | Time | Unblocks |
|---|---|---|---|
| 1 | Start Meta Business verification | 15 min, then days–weeks waiting | WhatsApp (Phase D) |
| 2 | Termii account + sender ID | 20 min, then 1–3 days waiting | SMS reminders (no longer blocks login — see below) |
| 3 | Postgres database | 10 min | **Everything — my main blocker** |
| 4 | Paystack test keys | 15 min | Checkout, splits, commissions |
| 5 | Fill in `.env` | 5 min | Me, immediately |
| 6 | GitHub remote | 10 min | Backup + Vercel deploy |
| 7 | Vercel account | 10 min | Live URL (reminder cron now runs via a free GitHub Actions workflow instead, since Vercel's Hobby plan only allows daily crons — see README's deploy checklist) |

**A rule for all of it: never paste keys or secrets into chat.** Put them in
`.env` yourself. I run the commands; the process reads the file. I never need to
see the values. Use **test/sandbox keys only** until we're genuinely ready to
take real money.

---

## 1. Start Meta Business verification — do this first

This is the longest wait in the whole project and nothing about it speeds up by
being started later. The PRD flags it as the usual bottleneck.

1. Go to [business.facebook.com](https://business.facebook.com) and create a
   Business Portfolio if you don't have one.
2. Business Settings → Security Centre → **Start Verification**.
3. Have ready: your CAC registration, a business bank statement or utility bill
   with the business name and address, and a business phone number.
4. Submit and forget about it. We build on SMS meanwhile.

**Why now:** WhatsApp is Phase D and it's *gated on Meta's queue, not on code*.
If you start it today, it will likely clear around the time the rest is ready.

---

## 2. Termii account + sender ID

Termii is your BSP for SMS/WhatsApp appointment reminders. Login no longer
depends on it — Termii is a paid API and its sender ID takes days to
approve, which made it a bad fit for something as basic as "can an owner
get into their own dashboard." Login is phone + password now (see
`README.md`'s Auth section), so this item only gates reminders and can move
down your priority list.

1. Sign up at [termii.com](https://termii.com).
2. Copy your **API key** from the dashboard.
3. Request a **Sender ID** — the name that appears as the SMS sender. Pick
   something recognisable to salon owners, not "SalonMVP".
4. Fund the account with a small amount (a few thousand naira is plenty for
   testing).

**Sender ID approval takes 1–3 business days.** Until it clears, reminders
won't deliver — everything else works without it.

---

## 3. Postgres database — my main blocker

Nothing can be verified without this. It's also the quickest item on the list.

1. Create a free project at [supabase.com](https://supabase.com) or
   [neon.tech](https://neon.tech). Either works — we only use it as managed
   Postgres, not for auth.
2. Choose the region closest to Nigeria (usually **eu-west** / London).
3. Copy the **connection string**.

**The gotcha that will actually bite you — do not use the "Direct connection"
string.** Since 2024 Supabase serves direct connections over **IPv6 only**, and
most home and office networks in Nigeria are IPv4. The symptom is not an error:
the connection just *hangs* until it times out, which looks like a broken
project rather than a network mismatch. (Confirmed on this project — the direct
host has no IPv4 address at all.)

Use the **Session pooler** string instead. In the Supabase dashboard press
**Connect** (top bar), then under *Connection string* choose **Session pooler**.
It looks like:

```
postgresql://postgres.<project-ref>:<password>@aws-N-<region>.pooler.supabase.com:5432/postgres
```

Copy it exactly as shown — don't guess at `aws-0` vs `aws-1` or the region.
This project's turned out to be `aws-1-eu-west-1`, found only by getting it
from the dashboard directly; brute-forcing region/prefix combinations against
a live database is slow and not something to repeat.

Note the username is `postgres.<project-ref>`, not plain `postgres`. Append
`?sslmode=require` — without it, Prisma fails with `P1001: Can't reach
database server`, which reads like a network problem but isn't one.

**Later, for Vercel:** serverless functions open many short-lived connections
and should use the **Transaction pooler** (port 6543) with `?pgbouncer=true`
appended. We'll set that as a separate production variable at deploy time —
transaction mode doesn't support prepared statements, so it can't be used for
migrations.

**If your password contains `@`, `#`, `/` or `:`** it must be percent-encoded in
the URL (`@` becomes `%40`), otherwise the URL parser misreads where the
password ends and the hostname begins.

**`prisma migrate dev` will hang against this pooler — use `migrate deploy`
instead.** `migrate dev` needs a shadow database to compute its diff, which
needs `CREATE DATABASE` privileges the pooler doesn't grant; it hangs rather
than failing cleanly. `migrate deploy` applies migration files directly and
needs no shadow database — write the migration SQL by hand when a schema
change is non-trivial, then `npx prisma migrate deploy`.

---

## 4. Paystack test keys

1. Sign up at [paystack.com](https://paystack.com).
2. Dashboard → Settings → API Keys & Webhooks.
3. Copy the **test** secret key (`sk_test_…`) and public key (`pk_test_…`).

Full activation needs BVN/CAC and can wait — **test keys work immediately and
are all I need.** Test mode lets us run the whole checkout, split, and
commission flow with fake cards and no real money.

---

## 5. Fill in `.env`

```bash
cp .env.example .env
```

Then fill in what you collected above. For the two secrets, generate random
strings rather than inventing them:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run it twice — once for `AUTH_SECRET`, once for `CRON_SECRET`.

Leave `NEXT_PUBLIC_APP_URL` as `http://localhost:3000` until we deploy.

`.env` is already gitignored, so it will never be committed.

---

## 6. GitHub remote

Right now this project exists as git history on one laptop. If the machine dies,
so does the work.

1. Create a **private** repo at [github.com/new](https://github.com/new) — name
   it `salon-mvp`, don't add a README or .gitignore.
2. Then, from the project folder:

```bash
git remote add origin https://github.com/YOUR-USERNAME/salon-mvp.git
git push -u origin main
```

---

## 7. Vercel account

Not needed until we deploy, but free and quick.

1. Sign up at [vercel.com](https://vercel.com) with the GitHub account from
   step 6.
2. Don't import the project yet — I'll walk through the environment variables
   and the cron settings when we're ready.

Note: the reminder cron runs every 15 minutes, which **may need a paid Vercel
plan**. Worth checking your plan's cron limits before pilot.

---

## When you're done

Tell me once **steps 3, 4 and 5** are complete (database, Paystack test keys,
`.env` filled). Steps 1, 2, 6 and 7 can still be in flight — they don't block me.

Then I can immediately:

- Run the migrations and apply the double-booking constraint
- Seed a test salon and walk the full QA checklist
- Prove the concurrency fix actually works by firing simultaneous bookings
- Fix whatever the first real run breaks — it always breaks something

---

## The one item that isn't technical

The PRD is still marked *"pending discovery-interview validation"* and states
the whole thing **depends on** confirming owners will adopt the payment-integrity
flow rather than route around it.

There's an interview script sitting next to the PRD. If those conversations
haven't happened, they're worth more than any week of building here — because
they test the assumption everything else rests on. Nothing in this checklist
blocks them, and they don't block me either. Run them in parallel.
