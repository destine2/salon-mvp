# What I need from you before development can continue

Everything in the codebase so far has been typechecked, built, and unit-tested —
but **nothing has ever talked to a database, Paystack, or a real phone.** The
items below are the ones only you can do: they need your identity, your business
details, or your money.

Ordered so the slowest queues start first and the biggest blocker clears soonest.

| # | Task | Time | Unblocks |
|---|---|---|---|
| 1 | Start Meta Business verification | 15 min, then days–weeks waiting | WhatsApp (Phase D) |
| 2 | Termii account + sender ID | 20 min, then 1–3 days waiting | OTP login, SMS reminders |
| 3 | Postgres database | 10 min | **Everything — my main blocker** |
| 4 | Paystack test keys | 15 min | Checkout, splits, commissions |
| 5 | Fill in `.env` | 5 min | Me, immediately |
| 6 | GitHub remote | 10 min | Backup + Vercel deploy |
| 7 | Vercel account | 10 min | Live URL, reminder cron |

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

Termii is your BSP for both phone-OTP login and SMS reminders.

1. Sign up at [termii.com](https://termii.com).
2. Copy your **API key** from the dashboard.
3. Request a **Sender ID** — the name that appears as the SMS sender. Pick
   something recognisable to salon owners, not "SalonMVP".
4. Fund the account with a small amount (a few thousand naira is plenty for
   testing).

**Sender ID approval takes 1–3 business days.** Until it clears, OTP login and
reminders won't deliver — so request it now even though we don't need it today.

---

## 3. Postgres database — my main blocker

Nothing can be verified without this. It's also the quickest item on the list.

1. Create a free project at [supabase.com](https://supabase.com) or
   [neon.tech](https://neon.tech). Either works — we only use it as managed
   Postgres, not for auth.
2. Choose the region closest to Nigeria (usually **eu-west** / London).
3. Copy the **connection string**.

**One gotcha:** Supabase gives you two connection strings — a direct one (port
5432) and a pooled one (port 6543). Use the **direct** one for now; pooling only
matters once we deploy to Vercel, and I'll handle that then.

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
