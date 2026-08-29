import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/paystack";

/**
 * Public — Paystack calls this directly, there's no session. Authenticated
 * entirely by the x-paystack-signature header (see verifyWebhookSignature),
 * never by anything in the payload itself: "never trust the browser
 * redirect... only the signed webhook" is the plan doc's own rule, applied
 * here for real for the first time in this app.
 *
 * Three event types, matching a subscription's actual lifecycle:
 *  - subscription.create: fired once, right after the first charge succeeds.
 *    This is the only reliable place to learn the subscription_code, which
 *    subscription.disable later needs to identify which salon lapsed.
 *  - charge.success: fired for every successful charge, first and every
 *    renewal — but also for perfectly ordinary customer checkouts/deposits,
 *    which never carry `data.plan`, so those are ignored here.
 *  - subscription.disable: fired after a subscription is cancelled or
 *    exhausts Paystack's own retry policy on a failed renewal — this IS the
 *    grace period; nothing in this app adds another one on top.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  switch (event.event) {
    case "subscription.create": {
      const salonId = salonIdFromReference(event.data?.reference);
      if (!salonId) break;
      await prisma.salon.updateMany({
        where: { id: salonId },
        data: {
          paystackSubscriptionCode: event.data.subscription_code,
          paystackCustomerCode: event.data.customer?.customer_code,
        },
      });
      break;
    }

    case "charge.success": {
      // Ordinary checkout/deposit charges never carry a plan — only a
      // subscription-linked charge does. This is what keeps this handler
      // from firing on every customer payment in the app.
      if (!event.data?.plan) break;
      const salonId = salonIdFromReference(event.data?.reference);
      if (!salonId) break;

      const salon = await prisma.salon.findUnique({ where: { id: salonId } });
      if (!salon) break;
      // Idempotent: Paystack retries webhook delivery, so a repeat of the
      // same reference (the current period's payment) must be a no-op, not
      // a second period extension — same principle as the plan's original
      // "unique constraint on the provider reference" rule.
      if (salon.lastSubscriptionPaymentRef === event.data.reference) break;

      const interval: string | undefined = event.data.plan?.interval;
      const periodDays = interval === "annually" ? 365 : 30; // this app only creates monthly plans; annually kept for completeness
      await prisma.salon.update({
        where: { id: salonId },
        data: {
          tier: "PAID",
          subscriptionRenewsAt: new Date(Date.now() + periodDays * 24 * 60 * 60_000),
          lastSubscriptionPaymentRef: event.data.reference,
        },
      });
      break;
    }

    case "subscription.disable": {
      const subscriptionCode = event.data?.subscription_code;
      if (!subscriptionCode) break;
      await prisma.salon.updateMany({
        where: { paystackSubscriptionCode: subscriptionCode },
        data: { tier: "FREE" },
      });
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}

/** This app's own subscribe-charge reference format: sub_<salonId>_<timestamp>. */
function salonIdFromReference(reference: string | undefined): string | null {
  const match = /^sub_(.+)_\d+$/.exec(reference ?? "");
  return match?.[1] ?? null;
}
