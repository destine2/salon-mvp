import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const [serviceCount, otherStaffCount] = await Promise.all([
    prisma.service.count({ where: { salonId: staff.salonId } }),
    prisma.staff.count({ where: { salonId: staff.salonId, role: { not: "OWNER" } } }),
  ]);
  const setupSteps = [
    { done: serviceCount > 0, label: "Add at least one service", href: "/dashboard/services" },
    { done: otherStaffCount > 0, label: "Add at least one staff member", href: "/dashboard/staff" },
  ];
  const setupIncomplete = setupSteps.some((s) => !s.done);

  return (
    <main style={{ padding: "2.5rem" }}>
      <h1>{staff.salon.name}</h1>
      <p>
        Logged in as {staff.name} ({staff.role})
      </p>

      {setupIncomplete && (
        <div style={{ background: "#e7f1ff", padding: "12px 16px", margin: "12px 0", maxWidth: 420 }}>
          <strong>Before customers can book:</strong>
          <ul style={{ marginBottom: 0 }}>
            {setupSteps.map((s) => (
              <li key={s.label} style={{ textDecoration: s.done ? "line-through" : "none" }}>
                {s.done ? "✓ " : ""}
                <Link href={s.href}>{s.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul>
        <li>
          <Link href="/dashboard/calendar">Today's calendar & walk-ins</Link>
        </li>
        <li>
          <Link href="/dashboard/services">Manage services</Link>
        </li>
        <li>
          <Link href="/dashboard/staff">Manage staff & commission</Link>
        </li>
        <li>
          <Link href="/dashboard/reports">Daily reconciliation</Link>
        </li>
        <li>
          <Link href="/dashboard/earnings">My earnings</Link>
        </li>
      </ul>
      <p>
        Customer booking link (share this on WhatsApp): <code>{bookingLink}</code>
      </p>
    </main>
  );
}
