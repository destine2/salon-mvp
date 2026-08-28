import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isSlotAvailable } from "@/lib/scheduling";
import { appointmentEndTime, isSlotConflictError } from "@/lib/overlap";

const EDITABLE_STATUSES = ["BOOKED", "CONFIRMED", "NO_SHOW", "CANCELLED"] as const;
const SLOT_TAKEN = "That staff member already has an appointment at that time.";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: { staff: { include: { commissionRule: true } }, customer: true, service: true, transaction: { include: { splits: true } }, deposit: true },
  });
  if (!appointment || appointment.salonId !== session.salonId) {
    return NextResponse.json({ ok: false, error: "Appointment not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, appointment });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: { service: true },
  });
  if (!appointment || appointment.salonId !== session.salonId) {
    return NextResponse.json({ ok: false, error: "Appointment not found" }, { status: 404 });
  }

  const body = await req.json();
  const data: {
    status?: (typeof EDITABLE_STATUSES)[number];
    staffId?: string;
    startTime?: Date;
    endTime?: Date;
  } = {};

  if (body.status) {
    if (!EDITABLE_STATUSES.includes(body.status)) {
      // COMPLETED is deliberately not in EDITABLE_STATUSES — an appointment
      // can only become COMPLETED by going through checkout (POST
      // /api/transactions), which is what makes payment-integrity tracking
      // actually hold (PRD 5.2). This route can't be used to route around it.
      return NextResponse.json(
        { ok: false, error: "Appointments can only be marked complete through checkout." },
        { status: 400 }
      );
    }
    data.status = body.status;
  }

  if (body.startTime || body.staffId) {
    const newStaffId = body.staffId ?? appointment.staffId;
    // Only checked when actually reassigning to a different staff member —
    // moving an existing appointment's time without changing who it's with
    // must still work even if that staff has since been deactivated.
    if (body.staffId && body.staffId !== appointment.staffId) {
      const newStaff = await prisma.staff.findUnique({ where: { id: newStaffId } });
      if (!newStaff || newStaff.salonId !== session.salonId) {
        return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });
      }
      if (!newStaff.active) {
        return NextResponse.json({ ok: false, error: "This staff member is deactivated — reactivate them first." }, { status: 409 });
      }
    }
    const newStart = body.startTime ? new Date(body.startTime) : appointment.startTime;
    const available = await isSlotAvailable({
      staffId: newStaffId,
      startTime: newStart,
      durationMin: appointment.service.durationMin,
      excludeAppointmentId: appointment.id,
    });
    if (!available) {
      return NextResponse.json({ ok: false, error: SLOT_TAKEN }, { status: 409 });
    }
    data.staffId = newStaffId;
    data.startTime = newStart;
    // endTime must move with startTime or the stored range — and therefore the
    // exclusion constraint — would be checked against a stale end.
    data.endTime = appointmentEndTime(newStart, appointment.service.durationMin);
  }

  try {
    const updated = await prisma.appointment.update({ where: { id: params.id }, data });
    return NextResponse.json({ ok: true, appointment: updated });
  } catch (error) {
    if (isSlotConflictError(error)) {
      return NextResponse.json({ ok: false, error: SLOT_TAKEN }, { status: 409 });
    }
    throw error;
  }
}
