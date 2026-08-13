import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerSession } from "@/lib/require-owner";
import { createStaffSubaccount } from "@/lib/paystack";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  const staff = await prisma.staff.findUnique({ where: { id: params.id }, include: { commissionRule: true } });
  if (!staff || staff.salonId !== session!.salonId) {
    return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });
  }

  const { businessName, bankCode, accountNumber } = await req.json();
  if (!businessName || !bankCode || !accountNumber) {
    return NextResponse.json(
      { ok: false, error: "businessName, bankCode, and accountNumber are required" },
      { status: 400 }
    );
  }

  // The subaccount's percentage_charge is what Paystack keeps for the MAIN
  // (owner) account on every split payment to this staff member. We seed it
  // from their current commission rule so Paystack and our own records
  // agree at setup time — but the two aren't kept in sync automatically
  // after this. If the commission rule changes later, the subaccount's
  // split needs to be updated too (a known MVP gap, worth a follow-up task).
  const rule = staff.commissionRule;
  const ownerPercentage = rule && rule.type === "PERCENT" ? 100 - Number(rule.value) : 50;

  const result = await createStaffSubaccount({
    businessName,
    bankCode,
    accountNumber,
    percentageCharge: ownerPercentage,
  });

  if (!result?.status) {
    return NextResponse.json({ ok: false, error: result?.message ?? "Paystack could not create this subaccount." }, { status: 502 });
  }

  const updated = await prisma.staff.update({
    where: { id: params.id },
    data: { paystackSubaccountCode: result.data.subaccount_code },
  });

  return NextResponse.json({ ok: true, staff: updated });
}
