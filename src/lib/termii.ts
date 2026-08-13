import axios from "axios";

// Thin wrapper around Termii — handles both phone-OTP login and
// appointment reminders (WhatsApp first, SMS fallback). PRD sections 5.1, 8.1.
// Docs: https://developers.termii.com/

const termii = axios.create({ baseURL: "https://api.ng.termii.com/api" });

/** Send a one-time-passcode to a staff/owner phone number for login (no passwords). */
export async function sendOtp(phone: string) {
  const { data } = await termii.post("/sms/otp/send", {
    api_key: process.env.TERMII_API_KEY,
    message_type: "NUMERIC",
    to: phone,
    from: process.env.TERMII_SENDER_ID,
    channel: "generic",
    pin_attempts: 3,
    pin_time_to_live: 10, // minutes
    pin_length: 6,
    pin_placeholder: "< 123456 >",
    message_text: "Your Salon MVP login code is < 123456 >. It expires in 10 minutes.",
  });
  return data; // data.pinId -> store temporarily, needed to verify
}

export async function verifyOtp(pinId: string, pin: string) {
  const { data } = await termii.post("/sms/otp/verify", {
    api_key: process.env.TERMII_API_KEY,
    pin_id: pinId,
    pin,
  });
  return data; // data.verified === true on success
}

/**
 * Appointment reminder — tries WhatsApp first (cheap/free inside the
 * 24h session window per PRD section 8), falls back to SMS.
 * NOTE: the WhatsApp send call/template name depends on what gets approved
 * during Meta Business verification — wire this up once that's done (Week 0).
 */
export async function sendReminder(params: { phone: string; message: string; channel?: "whatsapp" | "sms" | "generic" }) {
  const { data } = await termii.post("/sms/send", {
    api_key: process.env.TERMII_API_KEY,
    to: params.phone,
    from: process.env.TERMII_SENDER_ID,
    sms: params.message,
    type: "plain",
    channel: params.channel ?? "generic", // swap to "whatsapp" once the WhatsApp channel/template is live
  });
  return data;
}
