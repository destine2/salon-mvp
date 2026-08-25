import { prisma } from "@/lib/prisma";
import { sendReminder } from "@/lib/termii";
import type { Appointment, Customer, Salon, Service } from "@prisma/client";

type ReminderAppointment = Appointment & { customer: Customer; service: Service; salon: Salon };

function formatReminder(appt: ReminderAppointment, hoursOut: "24h" | "2h") {
  const time = appt.startTime.toLocaleString("en-NG", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const when = hoursOut === "24h" ? "tomorrow" : "in about 2 hours";
  return `Hi${appt.customer.name ? " " + appt.customer.name : ""}! Reminder: your ${appt.service.name} at ${appt.salon.name} is ${when} (${time}). See you then!`;
}

/**
 * Runs on a schedule (see /api/cron/send-reminders +
 * .github/workflows/send-reminders.yml). Reminders
 * are queued server-side rather than depending on the salon's own device
 * being online, per PRD 7.1 step 5 — this is what makes that true: it's a
 * cron job hitting the database directly, not something triggered from the
 * calendar page in a browser tab.
 */
export async function sendDueReminders() {
  const now = new Date();

  const in24h = new Date(now.getTime() + 24 * 60 * 60_000);
  const in24hWindowStart = new Date(in24h.getTime() - 15 * 60_000);
  const in24hWindowEnd = new Date(in24h.getTime() + 15 * 60_000);

  const in2h = new Date(now.getTime() + 2 * 60 * 60_000);
  const in2hWindowStart = new Date(in2h.getTime() - 15 * 60_000);
  const in2hWindowEnd = new Date(in2h.getTime() + 15 * 60_000);

  const [due24h, due2h] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        status: { in: ["BOOKED", "CONFIRMED"] },
        startTime: { gte: in24hWindowStart, lte: in24hWindowEnd },
        reminder24SentAt: null,
      },
      include: { customer: true, service: true, salon: true },
    }),
    prisma.appointment.findMany({
      where: {
        status: { in: ["BOOKED", "CONFIRMED"] },
        startTime: { gte: in2hWindowStart, lte: in2hWindowEnd },
        reminder2SentAt: null,
      },
      include: { customer: true, service: true, salon: true },
    }),
  ]);

  let sent = 0;

  for (const appt of due24h) {
    await sendReminder({ phone: appt.customer.phone, message: formatReminder(appt, "24h") });
    await prisma.appointment.update({ where: { id: appt.id }, data: { reminder24SentAt: now } });
    sent++;
  }

  for (const appt of due2h) {
    await sendReminder({ phone: appt.customer.phone, message: formatReminder(appt, "2h") });
    await prisma.appointment.update({ where: { id: appt.id }, data: { reminder2SentAt: now } });
    sent++;
  }

  return { sent, checked24h: due24h.length, checked2h: due2h.length };
}
