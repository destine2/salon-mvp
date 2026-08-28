import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CopyLinkButton from "./copy-link-button";

// First cut of the "protected route wrapper" from the task list: any page
// that needs a logged-in owner/staff calls getSession() and redirects if
// there isn't one. If more pages need this, pull the check into a shared
// layout (src/app/dashboard/layout.tsx) instead of repeating it per page.
export default async function DashboardPage() {
  const session = getSession();
  if (!session) redirect("/login");

  const staff = await prisma.staff.findUnique({
    where: { id: session.staffId },
    include: { salon: true },
  });

  if (!staff) redirect("/login");

  // Building the absolute booking-link URL from request headers rather than
  // window.location — this page is a Server Component, so window is never
  // defined when it renders.
  const host = headers().get("host");
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const bookingLink = host ? `${protocol}://${host}/book/${staff.salonId}` : `/book/${staff.salonId}`;

  // Lightweight first-run nudge (task #41) — rather than a separate signup
  // wizard (out of MVP scope: owners are pre-seeded, not self-registering),
  // this just checks what's missing and points at it. Booking can't work
  // with zero services or zero non-owner staff, so call that out plainly.
  const [serviceCount, otherStaffCount, hoursCount] = await Promise.all([
    prisma.service.count({ where: { salonId: staff.salonId } }),
    prisma.staff.count({ where: { salonId: staff.salonId, role: { not: "OWNER" }, active: true } }),
    prisma.businessHours.count({ where: { salonId: staff.salonId } }),
  ]);
  const setupSteps = [
    { done: serviceCount > 0, label: "Add at least one service", href: "/dashboard/services" },
    { done: otherStaffCount > 0, label: "Add at least one staff member", href: "/dashboard/staff" },
    // Not strictly blocking — unset hours fall back to 9-19 — but a salon
    // running on someone else's default hours will take bookings it can't serve.
    { done: hoursCount > 0, label: "Set your opening hours", href: "/dashboard/hours" },
  ];
  const setupIncomplete = setupSteps.some((s) => !s.done);

  const navItems = [
    { href: "/dashboard/calendar", label: "Today's calendar", desc: "Walk-ins, confirmations, reschedules" },
    { href: "/dashboard/services", label: "Services", desc: "Prices and durations" },
    { href: "/dashboard/staff", label: "Staff & commission", desc: "Payouts, roles, commission rules" },
    { href: "/dashboard/hours", label: "Opening hours", desc: "Per-weekday open/close times" },
    { href: "/dashboard/settings", label: "Settings", desc: "Deposits and booking policy" },
    { href: "/dashboard/reports", label: "Daily reconciliation", desc: "Booked vs. collected, flagged payments" },
    { href: "/dashboard/earnings", label: "My earnings", desc: "Your own running total" },
  ];

  return (
    <main style={{ padding: "var(--space-5)", maxWidth: 880, margin: "0 auto" }}>
      <header style={{ marginBottom: "var(--space-4)" }}>
        <h1>{staff.salon.name}</h1>
        <span className="pill pill-neutral">
          {staff.name} · {staff.role}
        </span>
      </header>

      {setupIncomplete && (
        <div
          className="card"
          style={{ marginBottom: "var(--space-4)", borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}
        >
          <p style={{ fontWeight: 700, color: "var(--color-ink)", marginBottom: "var(--space-2)" }}>Before customers can book</p>
          <ul style={{ margin: 0, paddingLeft: "1.2em", color: "var(--color-ink-soft)" }}>
            {setupSteps.map((s) => (
              <li key={s.label} style={{ marginBottom: "var(--space-1)" }}>
                {s.done ? (
                  <span style={{ color: "var(--color-success)", textDecoration: "line-through" }}>{s.label}</span>
                ) : (
                  <Link href={s.href}>{s.label}</Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={navGrid}>
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="card" style={navCard}>
            <span style={{ fontWeight: 700, color: "var(--color-ink)" }}>{item.label}</span>
            <span style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)" }}>{item.desc}</span>
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginTop: "var(--space-4)" }}>
        <p className="field-label" style={{ marginBottom: "var(--space-2)" }}>
          Customer booking link — share this on WhatsApp
        </p>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
          <code style={linkCode}>{bookingLink}</code>
          <CopyLinkButton link={bookingLink} />
        </div>
      </div>
    </main>
  );
}

const navGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: "var(--space-3)",
};

const navCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  textDecoration: "none",
};

const linkCode: React.CSSProperties = {
  flex: 1,
  minWidth: 200,
  fontFamily: "monospace",
  fontSize: "0.875rem",
  padding: "0.5em 0.75em",
  background: "var(--color-surface-sunken)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--color-ink-soft)",
  wordBreak: "break-all",
};
