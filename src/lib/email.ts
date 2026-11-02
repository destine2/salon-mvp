// Email via Resend's HTTP API — plain fetch, no SDK. With no RESEND_API_KEY
// configured it skips (and logs) instead of failing, so booking never breaks
// because email isn't set up yet.

export type EmailResult = { sent: boolean; reason?: string };

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email skipped: RESEND_API_KEY not set] to=${params.to} subject="${params.subject}"`);
    return { sent: false, reason: "not-configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Salon Bookings <onboarding@resend.dev>",
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email failed] ${res.status} ${body.slice(0, 300)}`);
      return { sent: false, reason: `http-${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email failed]", err);
    return { sent: false, reason: "network" };
  }
}

export function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Minimal branded wrapper; every interpolated value is HTML-escaped. */
export function emailLayout(title: string, lines: string[], salonName: string) {
  const body = lines.map((l) => `<p style="margin:0 0 12px;line-height:1.5">${esc(l)}</p>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;background:#F1EAE0;padding:24px"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden"><div style="background:#171310;color:#F1EAE0;padding:20px 24px"><div style="color:#B38F5C;font-size:12px;letter-spacing:.08em;text-transform:uppercase">${esc(salonName)}</div><h1 style="margin:6px 0 0;font-size:20px">${esc(title)}</h1></div><div style="padding:24px;color:#171310;font-size:15px">${body}</div></div></div>`;
  return { html, text: `${title}\n\n${lines.join("\n")}` };
}
