import { emailLayout, sendEmail } from "@/lib/email";
import { withTenant } from "@/lib/tenant";

export function formatLagosTime(d: Date) {
  return d.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Emails sent once a booking is actually confirmed (straight to BOOKED, or
 * after its deposit is paid): an alert to the salon, and a confirmation to
 * the customer if they gave an email. Never throws — a mail problem must not
 * fail a booking that already succeeded.
 */
export async function sendBookingConfirmed(salonId: string, appointmentId: string): Promise<void> {
  try {
    const appt = await withTenant(salonId, (tx) =>
      tx.appointment.findUnique({
        where: { id: appointmentId },
        include: { customer: true, service: true, staff: true, salon: true },
      })
    );
    if (!appt) return;

    const when = formatLagosTime(appt.startTime);
    const who = appt.customer.name || appt.customer.phone;

    if (appt.salon.notifyEmail) {
      const intake = appt.intake as { draping?: string; skinType?: string; areasOfFocus?: string; notes?: string } | null;
      const lines = [
        `${who} (${appt.customer.phone}${appt.customer.email ? ", " + appt.customer.email : ""}) booked ${appt.service.name} with ${appt.staff.name}.`,
        `When: ${when}`,
      ];
      if (intake?.draping) lines.push(`Draping: ${intake.draping}`);
      if (intake?.skinType) lines.push(`Skin type: ${intake.skinType}`);
      if (intake?.areasOfFocus) lines.push(`Focus: ${intake.areasOfFocus}`);
      if (intake?.notes) lines.push(`Notes: ${intake.notes}`);
      const { html, text } = emailLayout("New booking", lines, appt.salon.name);
      await sendEmail({ to: appt.salon.notifyEmail, subject: `New booking: ${who}, ${when}`, html, text });
    }

    if (appt.customer.email) {
      const { html, text } = emailLayout(
        "Your booking is confirmed",
        [
          `Hi${appt.customer.name ? " " + appt.customer.name : ""}, you're booked for ${appt.service.name} with ${appt.staff.name}.`,
          `When: ${when}`,
          `We'll send you reminders before your appointment. See you then!`,
        ],
        appt.salon.name
      );
      await sendEmail({ to: appt.customer.email, subject: `Booking confirmed: ${appt.salon.name}`, html, text });
    }
  } catch (err) {
    console.error("[sendBookingConfirmed failed]", err);
  }
}
