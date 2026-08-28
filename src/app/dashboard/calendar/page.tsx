"use client";

import { Fragment, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { submitOrQueue } from "@/lib/offline-sync";

type Appointment = {
  id: string;
  startTime: string;
  status: "HELD" | "BOOKED" | "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
  isWalkIn: boolean;
  staff: { id: string; name: string };
  customer: { name: string | null; phone: string };
  service: { name: string; priceNaira: string; durationMin: number };
  transaction: { id: string } | null;
};

type StaffOption = { id: string; name: string; role: string };
type ServiceOption = { id: string; name: string; durationMin: number };

const statusPillClass: Record<Appointment["status"], string> = {
  // Awaiting a deposit payment, not yet actually confirmed — same "not yet
  // settled" register as CONFIRMED, but for a different reason.
  HELD: "pill-warning",
  BOOKED: "pill-neutral",
  CONFIRMED: "pill-warning",
  COMPLETED: "pill-success",
  NO_SHOW: "pill-danger",
  CANCELLED: "pill-neutral",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Splits an ISO instant into the date/time pair a <input type="date"/time">
 *  pair needs, in the browser's local time — which is what the person
 *  rescheduling actually sees on their own clock. */
function toLocalDateTimeParts(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export default function CalendarPage() {
  const [date, setDate] = useState(todayIso());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Walk-in quick-add form state
  const [waStaffId, setWaStaffId] = useState("");
  const [waServiceId, setWaServiceId] = useState("");
  const [waCustomerName, setWaCustomerName] = useState("");
  const [waCustomerPhone, setWaCustomerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reschedule — inline per-row editor rather than a modal, since it's the
  // fastest path for someone doing this mid-conversation with a customer.
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rsDate, setRsDate] = useState("");
  const [rsTime, setRsTime] = useState("");
  const [rsStaffId, setRsStaffId] = useState("");
  const [rsError, setRsError] = useState<string | null>(null);
  const [rsSaving, setRsSaving] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [apptRes, staffRes, serviceRes] = await Promise.all([
        fetch(`/api/appointments?date=${date}`),
        fetch("/api/staff?active=true"),
        fetch("/api/services"),
      ]);
      const [apptData, staffData, serviceData] = await Promise.all([apptRes.json(), staffRes.json(), serviceRes.json()]);
      if (!apptData.ok) throw new Error(apptData.error ?? "Could not load appointments");
      if (!staffData.ok) throw new Error(staffData.error ?? "Could not load staff");
      if (!serviceData.ok) throw new Error(serviceData.error ?? "Could not load services");

      setAppointments(apptData.appointments);
      setStaffOptions(staffData.staff);
      setServiceOptions(serviceData.services);
      if (!waStaffId && staffData.staff[0]) setWaStaffId(staffData.staff[0].id);
      if (!waServiceId && serviceData.services[0]) setWaServiceId(serviceData.services[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function handleWalkIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        staffId: waStaffId,
        serviceId: waServiceId,
        startTime: new Date().toISOString(),
        customerName: waCustomerName || undefined,
        customerPhone: waCustomerPhone,
        isWalkIn: true,
      };
      // Walk-ins are exactly the case that has to survive a dropped
      // connection — a customer is standing in the shop right now.
      const { queued, response } = await submitOrQueue({
        url: "/api/appointments",
        method: "POST",
        body,
        description: `Walk-in: ${waCustomerPhone}`,
      });

      if (queued) {
        setWaCustomerName("");
        setWaCustomerPhone("");
        setError(null);
        // No server response yet — it'll appear once the outbox flushes and loadAll() is called again.
      } else {
        const data = await response!.json();
        if (!data.ok) throw new Error(data.error ?? "Could not add walk-in");
        setWaCustomerName("");
        setWaCustomerPhone("");
        await loadAll();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: string, status: Appointment["status"]) {
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not update appointment");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function startReschedule(a: Appointment) {
    const parts = toLocalDateTimeParts(a.startTime);
    setReschedulingId(a.id);
    setRsDate(parts.date);
    setRsTime(parts.time);
    setRsStaffId(a.staff.id);
    setRsError(null);
  }

  function cancelReschedule() {
    setReschedulingId(null);
    setRsError(null);
  }

  async function saveReschedule(id: string) {
    if (!rsDate || !rsTime) {
      setRsError("Pick both a date and a time.");
      return;
    }
    setRsSaving(true);
    setRsError(null);
    try {
      // `new Date("YYYY-MM-DDTHH:MM")` parses as browser-local time, which is
      // what the two plain inputs represent — then .toISOString() carries
      // that instant to the API in UTC. No timezone maths needed here: the
      // browser already knows the offset for "right now, this device."
      const startTime = new Date(`${rsDate}T${rsTime}`).toISOString();
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime, staffId: rsStaffId }),
      });
      const data = await res.json();
      if (!data.ok) {
        // The exclusion constraint is what actually enforces this — this
        // message is Postgres's rejection surfaced as the same 409 wording
        // used everywhere else in the app, not a separate error path.
        setRsError(data.error ?? "That slot isn't available.");
        return;
      }
      setReschedulingId(null);
      await loadAll();
    } catch (err) {
      setRsError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRsSaving(false);
    }
  }

  const byStaff = new Map<string, Appointment[]>();
  for (const appt of appointments) {
    const list = byStaff.get(appt.staff.id) ?? [];
    list.push(appt);
    byStaff.set(appt.staff.id, list);
  }

  return (
    <main style={page}>
      <Link href="/dashboard" style={backLink}>
        ← Dashboard
      </Link>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <h1 style={{ marginBottom: 0 }}>Calendar</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" style={{ maxWidth: 200 }} />
      </header>

      {error && <p className="error-text" style={{ marginTop: "var(--space-2)" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--color-ink-faint)", marginTop: "var(--space-3)" }}>Loading…</p>
      ) : appointments.length === 0 ? (
        <p style={{ color: "var(--color-ink-faint)", marginTop: "var(--space-3)" }}>No appointments for this day yet.</p>
      ) : (
        Array.from(byStaff.entries()).map(([staffId, appts]) => (
          <section key={staffId} style={{ marginTop: "var(--space-4)" }}>
            <h2 style={{ marginBottom: "var(--space-2)", fontSize: "1.125rem" }}>{appts[0].staff.name}</h2>
            <div className="card" style={{ padding: 0, overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Time</th>
                    <th style={th}>Customer</th>
                    <th style={th}>Service</th>
                    <th style={th}>Status</th>
                    <th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {appts.map((a) => (
                    <Fragment key={a.id}>
                      <tr style={tr}>
                        <td style={td}>{new Date(a.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                        <td style={td}>
                          {a.customer.name || "—"} ({a.customer.phone})
                          {a.isWalkIn ? <span className="pill pill-neutral" style={{ marginLeft: "var(--space-1)" }}>Walk-in</span> : null}
                        </td>
                        <td style={td}>{a.service.name}</td>
                        <td style={td}>
                          <span className={`pill ${statusPillClass[a.status]}`}>{a.status.replace("_", "-")}</span>
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {(a.status === "BOOKED" || a.status === "CONFIRMED") && (
                              <>
                                {a.status === "BOOKED" && (
                                  <button onClick={() => updateStatus(a.id, "CONFIRMED")} className="btn btn-secondary btn-sm">
                                    Confirm
                                  </button>
                                )}
                                <Link href={`/dashboard/checkout/${a.id}`} className="btn btn-primary btn-sm">
                                  Checkout
                                </Link>
                                <button onClick={() => startReschedule(a)} className="btn btn-ghost btn-sm">
                                  Reschedule
                                </button>
                                <button onClick={() => updateStatus(a.id, "NO_SHOW")} className="btn btn-danger btn-sm">
                                  No-show
                                </button>
                                <button onClick={() => updateStatus(a.id, "CANCELLED")} className="btn btn-ghost btn-sm">
                                  Cancel
                                </button>
                              </>
                            )}
                            {a.status === "COMPLETED" && a.transaction && <span className="pill pill-success">Paid ✓</span>}
                          </div>
                        </td>
                      </tr>
                      {reschedulingId === a.id && (
                        <tr style={tr}>
                          <td colSpan={5} style={inlineFormCell}>
                            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "flex-end" }}>
                              <label className="field" style={{ marginBottom: 0 }}>
                                <span className="field-label">Date</span>
                                <input type="date" value={rsDate} onChange={(e) => setRsDate(e.target.value)} className="input" />
                              </label>
                              <label className="field" style={{ marginBottom: 0 }}>
                                <span className="field-label">Time</span>
                                <input type="time" value={rsTime} onChange={(e) => setRsTime(e.target.value)} className="input" />
                              </label>
                              <label className="field" style={{ marginBottom: 0 }}>
                                <span className="field-label">Stylist</span>
                                <select value={rsStaffId} onChange={(e) => setRsStaffId(e.target.value)} className="input">
                                  {/* staffOptions only lists active staff — if this appointment's current
                                      stylist has since been deactivated, they still need to appear here
                                      (unchanged) so the select's value has a matching option and "Save"
                                      without touching this field doesn't silently reassign the booking. */}
                                  {!staffOptions.some((s) => s.id === a.staff.id) && (
                                    <option value={a.staff.id}>{a.staff.name} (inactive)</option>
                                  )}
                                  {staffOptions.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button onClick={() => saveReschedule(a.id)} disabled={rsSaving} className="btn btn-primary btn-sm">
                                {rsSaving ? "Saving…" : "Save"}
                              </button>
                              <button onClick={cancelReschedule} disabled={rsSaving} type="button" className="btn btn-ghost btn-sm">
                                Cancel
                              </button>
                            </div>
                            {rsError && <p className="error-text" style={{ marginTop: "var(--space-2)", marginBottom: 0 }}>{rsError}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <div className="card" style={{ maxWidth: 360, marginTop: "var(--space-5)" }}>
        <h2 style={{ marginBottom: "var(--space-3)" }}>Add a walk-in</h2>
        <form onSubmit={handleWalkIn}>
          <label className="field">
            <span className="field-label">Staff</span>
            <select value={waStaffId} onChange={(e) => setWaStaffId(e.target.value)} className="input">
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Service</span>
            <select value={waServiceId} onChange={(e) => setWaServiceId(e.target.value)} className="input">
              {serviceOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Customer name (optional)</span>
            <input value={waCustomerName} onChange={(e) => setWaCustomerName(e.target.value)} className="input" />
          </label>
          <label className="field">
            <span className="field-label">Customer phone</span>
            <input
              value={waCustomerPhone}
              onChange={(e) => setWaCustomerPhone(e.target.value)}
              placeholder="2348012345678"
              required
              className="input"
            />
          </label>
          <button type="submit" disabled={submitting || !waStaffId || !waServiceId} className="btn btn-primary" style={{ width: "100%" }}>
            {submitting ? "Adding…" : "Add walk-in (starts now)"}
          </button>
        </form>
      </div>
    </main>
  );
}

const page: React.CSSProperties = { padding: "var(--space-5)", maxWidth: 900, margin: "0 auto" };

const backLink: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--color-ink-faint)",
  marginBottom: "var(--space-3)",
};

const table: React.CSSProperties = { width: "100%", minWidth: 640, borderCollapse: "collapse" };

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.02em",
  color: "var(--color-ink-faint)",
  textTransform: "uppercase",
  padding: "var(--space-2) var(--space-3)",
  borderBottom: "1px solid var(--color-border)",
  background: "var(--color-surface-sunken)",
};

const tr: React.CSSProperties = { borderBottom: "1px solid var(--color-border)" };

const td: React.CSSProperties = { padding: "var(--space-2) var(--space-3)", fontSize: "0.9375rem", verticalAlign: "middle" };

const inlineFormCell: React.CSSProperties = { padding: "var(--space-3)", background: "var(--color-surface-sunken)" };
