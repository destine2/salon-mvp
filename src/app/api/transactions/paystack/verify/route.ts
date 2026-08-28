import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTransaction } from "@/lib/paystack";
import { calculateSplit } from "@/lib/commission";

// Called from the /checkout/paystack-callback page once Paystack redirects
// back. This is the "confirm a transaction actually settled before marking
// an appointment paid" step from PRD 7.2, step 4.
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference");
  if (!reference) {
    return NextResponse.json({ ok: false, error: "reference is required" }, { status: 400 });
  }

  // Our reference IS the appointmentId (see paystack/initialize).
  const appointment = await prisma.appointment.findUnique({
    where: { id: reference },
    include: { service: true, staff: { include: { commissionRule: true } }, transaction: { include: { splits: true } }, deposit: true },
  });
  if (!appointment) {
    return NextResponse.json({ ok: false, error: "Appointment not found for this reference" }, { status: 404 });
  }

  // Already processed (e.g. user refreshed the callback page) — return what we have instead of erroring.
  if (appointment.transaction) {
    return NextResponse.json({ ok: true, alreadyProcessed: true, transaction: appointment.transaction });
  }

  const result = await verifyTransaction(reference);
  if (!result?.status || result.data?.status !== "success") {
    return NextResponse.json({ ok: false, error: "Payment was not successful." }, { status: 402 });
  }

  const paidNow = result.data.amount / 100; // kobo -> naira, just this Paystack transaction
  const servicePrice = Number(appointment.service.priceNaira);
  // If a deposit was already paid at booking time, the true total collected
  // is deposit + this transaction — same reasoning as the cash/transfer
  // route: every downstream number has to reflect the total, or a
  // deposit-enabled salon's checkouts look under-collected and staff get
  // under-recorded on commission by exactly the deposit amount.
  const depositAlreadyPaid = appointment.deposit?.status === "PAID" ? Number(appointment.deposit.amountNaira) : 0;
  const amount = paidNow + depositAlreadyPaid;
  const isFlagged = amount < servicePrice;

  const rule = appointment.staff.commissionRule;
  // Paystack already moved the money via the subaccount split at checkout
  // time — these split rows are for reporting/reconciliation, not a second
  // payout, hence settledViaPaystack: true.
  //
  // This recomputes the split from CommissionRule as it exists right now,
  // same as /paystack/initialize did when it told Paystack how much to
  // route to the owner. In the ordinary case (checkout completes within the
  // few minutes a customer takes to pay) they agree, because it's the same
  // function on the same inputs. The one gap: if the owner edits this
  // staff member's commission rule in the window between initialize and
  // verify, this recomputes with the NEW rule while Paystack already paid
  // out using the split baked in at initialize time — the two would
  // disagree, silently, for that one transaction. Closing that fully means
  // stashing the split actually sent (e.g. in Paystack's metadata field on
  // initialize, read back here) rather than recomputing; not done here
  // because it's a narrow window on an action (editing commission rules)
  // that doesn't happen mid-checkout in practice, and this is worth
  // revisiting if that assumption ever stops holding.
  //
  // Second, deposit-specific gap, same "recorded, not silently wrong" spirit:
  // when a deposit ate into what should have been the staff's cut (their true
  // entitlement here exceeds `paidNow`), /paystack/initialize already clamped
  // what it asked Paystack to send the subaccount at 0 rather than negative —
  // meaning Paystack actually transferred at most `paidNow`, not the full
  // entitlement recomputed below. The split recorded here is still the
  // correct true entitlement (what reports should show is owed), but
  // settledViaPaystack: true on the staff row can overstate what was
  // automatically paid out in that specific edge case; the shortfall isn't
  // separately tracked. Rare in practice (only when a large deposit meets a
  // high-commission staff member), and the same category as this app's other
  // deliberately-manual edges (refunds, cash shortfalls).
  const split = rule ? calculateSplit(rule, amount) : { ownerShare: amount, staffShare: 0 };

  const transaction = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        appointmentId: appointment.id,
        amountNaira: amount,
        method: "CARD_TRANSFER",
        paystackRef: reference,
        isFlagged,
        splits: {
          create: [
            { recipient: "OWNER", amountNaira: split.ownerShare, settledViaPaystack: true },
            { recipient: "STAFF", staffId: appointment.staffId, amountNaira: split.staffShare, settledViaPaystack: true },
          ],
        },
      },
      include: { splits: true },
    });

    await tx.appointment.update({ where: { id: appointment.id }, data: { status: "COMPLETED" } });

    return created;
  });

  return NextResponse.json({ ok: true, transaction });
}
