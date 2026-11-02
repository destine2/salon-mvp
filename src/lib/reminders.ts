import { sendReminder } from "@/lib/termii";
import { emailLayout, sendEmail } from "@/lib/email";
import { formatLagosTime } from "@/lib/notifications";
import { instantToLagosDate, LAGOS_OFFSET_MINUTES, MINUTE_MS } from "@/lib/lagos-time";
import { listAllSalonIds, withTenant } from "@/lib/tenant";
import type { Appointment, Customer, Salon, Service } from "@prisma/client";

type ReminderAppointment = Appointment & { customer: Customer; service: Service; salon: Salon };

type Kind = "72h" | "24h" | "morning" | "2h";

// Hours-before windows (±15 min, matching the 15-minute cron cadence) for the
// fixed-offset reminders. "morning" is different: it fires at 08:00 Lagos on
// the day of the appointment, handled separately below.
const OFFSETS: { kind: Exclude<Kind, "morning">; hours: number; field: "reminder72SentAt" | "reminder24SentAt" | "reminder2SentAt" }[] = [
  { kind: "72h", hours: 72, field: "reminder72SentAt" },
  { kind: "24h", hours: 24, field: "reminder24SentAt" },
  { kind: "2h", hours: 2, field: "reminder2SentAt" },
];

const MORNING_HOUR_LAGOS = 8;
// A morning reminder is pointless if the appointment is within this long of
// 08:00 — the 2-hour reminder already covers it.
const MORNING_MIN_LEAD_MS = 3 * 60 * MINUTE_MS;

const WHEN_TEXT: Record<Kind, string> = {
  "72h": "in 3 days",
  "24h": "tomorrow",
  morning: "today",
  "2h": "in about 2 hours",
};

function reminderText(appt: ReminderAppointment, kind: Kind) {
  return `Reminder: your ${appt.service.name} at ${appt.salon.name} is ${WHEN_TEXT[kind]} (${formatLagosTime(appt.startTime)}).`;
}

function lagosHour(now: Date) {
  return ((now.getUTCHours() * 60 + now.getUTCMinutes() + LAGOS_OFFSET_MINUTES) / 60) % 24;
}

/** Email first (free, works today); SMS only if Termii is actually configured. True if anything was sent. */
async function deliver(appt: ReminderAppointment, kind: Kind): Promise<boolean> {
  const text = reminderText(appt, kind);
  let sent = false;

  if (appt.customer.email) {
    const greeting = `Hi${appt.customer.name ? " " + appt.customer.name : ""}!`;
    const { html, text: plain } = emailLayout("Appointment reminder", [greeting, text, "See you then!"], appt.salon.name);
    const r = await sendEmail({ to: appt.customer.email, subject: `Reminder: ${appt.service.name} ${WHEN_TEXT[kind]}`, html, text: plain });
    sent = sent || r.sent;
  }

  const termiiKey = process.env.TERMII_API_KEY;
  if (termiiKey && termiiKey !== "replace_me") {
    try {
      await sendReminder({ phone: appt.customer.phone, message: `Hi${appt.customer.name ? " " + appt.customer.name : ""}! ${text}` });
      sent = true;
    } catch (err) {
      console.error("[sms reminder failed]", err);
    }
  }
  return sent;
}

/**
 * Runs on a schedule (see /api/cron/send-reminders +
 * .github/workflows/send-reminders.yml), every 15 minutes. Sends up to four
 * reminders per appointment — 3 days before, 1 day before, the morning of,
 * and 2 hours before — each tracked by its own sent-marker so a re-run never
 * double-sends.
 *
 * Under RLS there's no single cross-tenant query: it sweeps every salon via
 * list_all_salon_ids(), then works inside each salon's tenant context.
 */
export async function sendDueReminders() {
  const now = new Date();
  const salonIds = await listAllSalonIds();
  const include = { customer: true, service: true, salon: true } as const;
  const status = { in: ["BOOKED", "CONFIRMED"] as ("BOOKED" | "CONFIRMED")[] };

  let sent = 0;
  let checked = 0;

  for (const salonId of salonIds) {
    const due: { appt: ReminderAppointment; kind: Kind; field: string }[] = [];

    await withTenant(salonId, async (tx) => {
      for (const o of OFFSETS) {
        const center = now.getTime() + o.hours * 60 * MINUTE_MS;
        const rows = await tx.appointment.findMany({
          where: { salonId, status, startTime: { gte: new Date(center - 15 * MINUTE_MS), lte: new Date(center + 15 * MINUTE_MS) }, [o.field]: null },
          include,
        });
        rows.forEach((appt) => due.push({ appt, kind: o.kind, field: o.field }));
      }

      if (lagosHour(now) >= MORNING_HOUR_LAGOS) {
        // Anything starting later today (Lagos) that hasn't had its morning reminder.
        const rows = await tx.appointment.findMany({
          where: { salonId, status, reminderMorningSentAt: null, startTime: { gt: new Date(now.getTime() + MORNING_MIN_LEAD_MS), lte: new Date(now.getTime() + 24 * 60 * MINUTE_MS) } },
          include,
        });
        const today = instantToLagosDate(now);
        rows.filter((a) => instantToLagosDate(a.startTime) === today).forEach((appt) => due.push({ appt, kind: "morning", field: "reminderMorningSentAt" }));
      }
    });

    checked += due.length;

    for (const { appt, kind, field } of due) {
      if (await deliver(appt, kind)) {
        await withTenant(salonId, (tx) => tx.appointment.update({ where: { id: appt.id }, data: { [field]: now } }));
        sent++;
      }
    }
  }

  return { sent, checked };
}
