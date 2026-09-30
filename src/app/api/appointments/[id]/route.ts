import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isSlotAvailable } from "@/lib/scheduling";
import { appointmentEndTime, isSlotConflictError } from "@/lib/overlap";
import { withTenant } from "@/lib/tenant";

const EDITABLE_STATUSES = ["BOOKED", "CONFIRMED", "NO_SHOW", "CANCELLED"] as const;
const SLOT_TAKEN = "That staff member already has an appointment at that time.";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const appointment = await withTenant(session.salonId, (tx) =>
    tx.appointment.findUnique({
      where: { id: params.id },
      include: { staff: { include: { commissionRule: true } }, customer: true, service: true, transaction: { include: { splits: true } }, deposit: true },
    })
  );
  if (!appointment || appointment.salonId !== session.salonId) {
    return NextResponse.json({ ok: false, error: "Appointment not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, appointment });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const body = await req.json();

  if (body.status && !EDITABLE_STATUSES.includes(body.status)) {
    // COMPLETED is deliberately not in EDITABLE_STATUSES — an appointment
    // can only become COMPLETED by going through checkout (POST
    // /api/transactions), which is what makes payment-integrity tracking
    // actually hold (PRD 5.2). This route can't be used to route around it.
    return NextResponse.json(
      { ok: false, error: "Appointments can only be marked complete through checkout." },
      { status: 400 }
    );
  }

  const result = await withTenant(session.salonId, async (tx) => {
    const appointment = await tx.appointment.findUnique({ where: { id: params.id }, include: { service: true } });
    if (!appointment || appointment.salonId !== session.salonId) {
      return "not-found" as const;
    }

    const data: {
      status?: (typeof EDITABLE_STATUSES)[number];
      staffId?: string;
      startTime?: Date;
      endTime?: Date;
    } = {};

    if (body.status) {
      data.status = body.status;
    }

    if (body.startTime || body.staffId) {
      const newStaffId = body.staffId ?? appointment.staffId;
      // Only checked when actually reassigning to a different staff member —
      // moving an existing appointment's time without changing who it's with
      // must still work even if that staff has since been deactivated.
      if (body.staffId && body.staffId !== appointment.staffId) {
        const newStaff = await tx.staff.findUnique({ where: { id: newStaffId } });
        if (!newStaff || newStaff.salonId !== session.salonId) {
          return "staff-not-found" as const;
        }
        if (!newStaff.active) {
          return "staff-inactive" as const;
        }
      }
      const newStart = body.startTime ? new Date(body.startTime) : appointment.startTime;
      const available = await isSlotAvailable(tx, {
        staffId: newStaffId,
        startTime: newStart,
        durationMin: appointment.service.durationMin,
        excludeAppointmentId: appointment.id,
      });
      if (!available) {
        return "slot-taken" as const;
      }
      data.staffId = newStaffId;
      data.startTime = newStart;
      // endTime must move with startTime or the stored range — and therefore the
      // exclusion constraint — would be checked against a stale end.
      data.endTime = appointmentEndTime(newStart, appointment.service.durationMin);
    }

    try {
      return await tx.appointment.update({ where: { id: params.id }, data });
    } catch (error) {
      if (isSlotConflictError(error)) {
        return "slot-taken" as const;
      }
      throw error;
    }
  });

  if (result === "not-found") return NextResponse.json({ ok: false, error: "Appointment not found" }, { status: 404 });
  if (result === "staff-not-found") return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });
  if (result === "staff-inactive") {
    return NextResponse.json({ ok: false, error: "This staff member is deactivated — reactivate them first." }, { status: 409 });
  }
  if (result === "slot-taken") return NextResponse.json({ ok: false, error: SLOT_TAKEN }, { status: 409 });

  return NextResponse.json({ ok: true, appointment: result });
}
