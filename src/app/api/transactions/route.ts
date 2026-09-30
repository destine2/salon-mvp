import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { calculateSplit } from "@/lib/commission";
import { withTenant } from "@/lib/tenant";

// Cash / bank-transfer checkout — the non-Paystack half of PRD 5.2's
// "every checkout is logged in one place" requirement. Paystack card/
// transfer payments go through src/app/api/transactions/paystack instead.
export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const { appointmentId, method, amountNaira } = await req.json();
  if (!appointmentId || !method || amountNaira == null) {
    return NextResponse.json(
      { ok: false, error: "appointmentId, method, and amountNaira are required" },
      { status: 400 }
    );
  }
  if (!["CASH", "BANK_TRANSFER"].includes(method)) {
    return NextResponse.json(
      { ok: false, error: "This endpoint only handles CASH or BANK_TRANSFER — use /api/transactions/paystack for card payments." },
      { status: 400 }
    );
  }

  const result = await withTenant(session.salonId, async (tx) => {
    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true, staff: { include: { commissionRule: true } }, transaction: true, deposit: true },
    });
    if (!appointment || appointment.salonId !== session.salonId) {
      return "not-found" as const;
    }
    if (appointment.transaction) {
      return "already-checked-out" as const;
    }

    // amountNaira from this form is the balance being logged right now — if a
    // deposit was already paid at booking time, the true total collected for
    // this appointment is deposit + this amount, and every downstream number
    // (isFlagged, the commission split, the stored Transaction.amountNaira)
    // needs to be computed on that total, not just today's entry, or a
    // deposit-enabled salon's checkouts would look under-collected and staff
    // would be under-paid on commission by exactly the deposit amount.
    const depositAlreadyPaid = appointment.deposit?.status === "PAID" ? Number(appointment.deposit.amountNaira) : 0;
    const amount = Number(amountNaira) + depositAlreadyPaid;
    const servicePrice = Number(appointment.service.priceNaira);
    // The payment-integrity check: logging less than the service's price is
    // exactly the "staff quietly discounts and pockets the difference"
    // pattern from the market research — flag it for the owner's daily
    // summary rather than silently accepting it.
    const isFlagged = amount < servicePrice;

    const rule = appointment.staff.commissionRule;
    const split = rule
      ? calculateSplit(rule, amount)
      : { ownerShare: amount, staffShare: 0 }; // no commission rule set — everything defaults to the owner until one is configured

    const created = await tx.transaction.create({
      data: {
        appointmentId,
        amountNaira: amount,
        method,
        isFlagged,
        splits: {
          create: [
            { recipient: "OWNER", amountNaira: split.ownerShare, settledViaPaystack: false },
            { recipient: "STAFF", staffId: appointment.staffId, amountNaira: split.staffShare, settledViaPaystack: false },
          ],
        },
      },
      include: { splits: true },
    });

    await tx.appointment.update({ where: { id: appointmentId }, data: { status: "COMPLETED" } });

    return { transaction: created, isFlagged };
  });

  if (result === "not-found") return NextResponse.json({ ok: false, error: "Appointment not found" }, { status: 404 });
  if (result === "already-checked-out") {
    return NextResponse.json({ ok: false, error: "This appointment has already been checked out." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, transaction: result.transaction, isFlagged: result.isFlagged });
}
