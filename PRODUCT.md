# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three distinct users, one shared dataset:

- **Salon owner** — signs up self-serve, configures services/staff/hours/payouts, and is the only role that can edit commission rules or staff records. Runs a small independent Nigerian salon (not a chain), likely their first or only software beyond WhatsApp.
- **Staff (stylist/apprentice)** — logs in to see their own day, do walk-in checkouts, and check their own earnings. Cannot touch staff/commission admin.
- **Customer** — never logs in. Books a slot and pays a deposit through a public, no-account page reached via a WhatsApp link. Phone number is their only identifier.

## Product Purpose

A booking + deposit engine for Nigerian salons, sold as a recurring SaaS layer under the same business as the Veloura-style static-site template product. The static sites are the acquisition funnel (their booking CTAs point here); this product is the retention layer — recurring revenue, and the reason a salon can't just leave for a free competitor once their booking history lives here.

Core promise, in order: (1) never double-book a stylist, (2) never let a completed appointment go unpaid or unrecorded, (3) make the deposit-collection habit painless enough that owners actually turn it on.

## Positioning

Not a generic booking calendar. The differentiator is **payment integrity**: every appointment that reaches "completed" is provably reconciled against a real payment record (cash, transfer, or Paystack split), and the dashboard actively surfaces the gap when it isn't — flagged under-collections, unaccounted completed appointments with no matching transaction. A competitor that only tracks bookings, not money, cannot make this claim truthfully.

Double-booking is prevented at the database level (a Postgres exclusion constraint), not by application-layer checking — this is a structural guarantee, not a best-effort one.

## Operating Context

- Nigerian salons, Lagos-anchored (Africa/Lagos, fixed UTC+1, no DST) but not geo-locked.
- WhatsApp is the discovery/booking channel salons already use; this product's booking link slots into that habit rather than replacing it.
- Commission is split three ways at the data model level (PERCENT of service price, FLAT amount, or CHAIR_RENTAL — a fixed cost the staff member owes the owner) — this is real Nigerian salon commission structure, not a simplification.
- Paystack subaccounts handle the actual money movement for digital payments (transaction splits), so the salon is paid directly, not through a platform-custodied balance.
- Poor connectivity is a real constraint: the owner dashboard is a PWA with an offline write queue for walk-ins/cash checkouts, because a salon floor doesn't always have reliable data.

## Capabilities and Constraints

- Next.js (App Router) + TypeScript, Prisma + PostgreSQL (Supabase), Paystack, deployed on Vercel.
- Self-serve signup exists (`/signup`) — a salon owner creates their own account, no manual provisioning.
- Auth is phone + password (not OTP-SMS) — Termii is a paid API with a pending sender-ID approval, so login was deliberately decoupled from it; Termii is retained only for appointment reminders (SMS/WhatsApp), not yet live.
- WhatsApp Cloud API for booking-adjacent messaging is explicitly out of scope for now (gated on Meta Business verification, not started).
- Staff are deactivated, not hard-deleted, once they have any booking/payment history — history must never disappear.
- No self-serve billing/subscription yet — `SalonTier` exists in the schema but isn't wired to payment collection.

## Brand Commitments

This product extends the visual identity already established for the company's static-site template product (Veloura), rather than inventing a separate one, so the SaaS and the template business read as one company's ecosystem.

Confirmed tokens to carry forward (from `BRAND_IDENTITY.md` and the shipped template CSS, not re-derived):

- **Primary:** gold `#B38F5C` (RGB `179, 143, 92`)
- **Secondary:** `#7C8268`
- **Dark neutral / footer:** `#171310`
- **Warm section background:** `#F1EAE0`
- **WhatsApp accent:** `#25D366` (dark `#1da851`) — reserved for actual WhatsApp affordances, not a general secondary CTA color
- **Typography:** Playfair Display (serif, display/headings), Dancing Script (cursive, sparing script accents), Work Sans (body)
- **Motion:** `cubic-bezier(0.25, 0.46, 0.45, 0.94)`, ~0.35s, soft card shadows (`rgba(37,37,37,0.08)` resting / `0.11` hover), -4px hover lift
- **Mood:** soft luxury, editorial, premium-but-warm — not corporate SaaS, not clinical

Open decision, not yet made: whether this palette applies uniformly to both the customer-facing booking page (closer in spirit to the template's Persuade-mode marketing feel) and the owner dashboard (an Operate-mode daily tool, where legibility and scan speed outrank expression) — resolve this in new-work rather than assuming.

## Evidence on Hand

- Live production deployment: `https://salon-mvp-japc.vercel.app` — real signup/booking/checkout flows, verified end-to-end this session including a completed Paystack test payment with correct commission split.
- `docs/product/Salon_SaaS_PRD.docx` and sibling business docs, copied into the repo.
- `ARCHITECTURE.md` documents real bugs found and fixed via live testing (not just unit tests) — timezone handling, the exclusion-constraint volatility issue, the FLAT/CHAIR_RENTAL commission-split bug.
- No customer testimonials, press, or case studies exist yet — do not fabricate any for this product (the template product has its own, unrelated to this one).

## Product Principles

1. **Structural guarantees over app-layer promises.** Double-booking prevention and payment-integrity flagging exist because the database enforces them, not because the UI is careful — design work should not weaken this by hiding or softening what these features surface.
2. **The owner is not a technical user.** They came from WhatsApp-based booking, not software. Every screen should assume this is their first real business software, not their tenth SaaS tool.
3. **Nothing blocks on a paid, pending-approval dependency.** Login, booking, and payment all had to work without Termii/WhatsApp being live — this is a durable constraint on future feature choices, not just a past workaround.
4. **History is permanent.** Deactivating, not deleting, is the standing pattern for anything with financial or booking history attached.
5. **One ecosystem, two products.** The static-site template business and this SaaS are related but distinct offers under the same company — the visual relationship should feel like sibling products, not a single rebrand of one onto the other.
