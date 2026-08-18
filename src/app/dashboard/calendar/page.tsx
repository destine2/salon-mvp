"use client";

import { Fragment, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { submitOrQueue } from "@/lib/offline-sync";

type Appointment = {
  id: string;
  startTime: string;
  status: "BOOKED" | "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
  isWalkIn: boolean;
  staff: { id: string; name: string };
  customer: { name: string | null; phone: string };
  service: { name: string; priceNaira: string; durationMin: number };
  transaction: { id: string } | null;
};

type StaffOption = { id: string; name: string; role: string };
type ServiceOption = { id: string; name: string; durationMin: number };

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
    <main style={{ padding: "2.5rem", maxWidth: 820 }}>
      <h1>Calendar</h1>
      <label>
        Date{" "}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: 6 }} />
      </label>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {loading ? (
        <p>Loading...</p>
      ) : appointments.length === 0 ? (
        <p>No appointments for this day yet.</p>
      ) : (
        Array.from(byStaff.entries()).map(([staffId, appts]) => (
          <section key={staffId} style={{ marginTop: "1.5rem" }}>
            <h2 style={{ marginBottom: 4 }}>{appts[0].staff.name}</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th>Time</th>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {appts.map((a) => (
                  <Fragment key={a.id}>
                    <tr style={{ borderBottom: reschedulingId === a.id ? "none" : "1px solid #eee" }}>
                      <td>{new Date(a.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                      <td>
                        {a.customer.name || "—"} ({a.customer.phone}){a.isWalkIn ? " · walk-in" : ""}
                      </td>
                      <td>{a.service.name}</td>
                      <td>{a.status}</td>
                      <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {(a.status === "BOOKED" || a.status === "CONFIRMED") && (
                          <>
                            {a.status === "BOOKED" && (
                              <button onClick={() => updateStatus(a.id, "CONFIRMED")}>Confirm</button>
                            )}
                            <Link href={`/dashboard/checkout/${a.id}`}>Checkout</Link>
                            <button onClick={() => startReschedule(a)}>Reschedule</button>
                            <button onClick={() => updateStatus(a.id, "NO_SHOW")}>No-show</button>
                            <button onClick={() => updateStatus(a.id, "CANCELLED")}>Cancel</button>
                          </>
                        )}
                        {a.status === "COMPLETED" && a.transaction && <span>Paid ✓</span>}
                      </td>
                    </tr>
                    {reschedulingId === a.id && (
                      <tr style={{ borderBottom: "1px solid #eee", background: "#f7f7f5" }}>
                        <td colSpan={5} style={{ padding: "10px 4px" }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <label>
                              Date{" "}
                              <input type="date" value={rsDate} onChange={(e) => setRsDate(e.target.value)} style={{ padding: 6 }} />
                            </label>
                            <label>
                              Time{" "}
                              <input type="time" value={rsTime} onChange={(e) => setRsTime(e.target.value)} style={{ padding: 6 }} />
                            </label>
                            <label>
                              Stylist{" "}
                              <select value={rsStaffId} onChange={(e) => setRsStaffId(e.target.value)} style={{ padding: 6 }}>
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
                            <button onClick={() => saveReschedule(a.id)} disabled={rsSaving}>
                              {rsSaving ? "Saving..." : "Save"}
                            </button>
                            <button onClick={cancelReschedule} disabled={rsSaving} type="button">
                              Cancel
                            </button>
                          </div>
                          {rsError && <p style={{ color: "crimson", margin: "6px 0 0" }}>{rsError}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}

      <h2 style={{ marginTop: "2rem" }}>Add a walk-in</h2>
      <form onSubmit={handleWalkIn} style={{ display: "grid", gap: 8, maxWidth: 320 }}>
        <label>
          Staff
          <select value={waStaffId} onChange={(e) => setWaStaffId(e.target.value)} style={{ display: "block", width: "100%", padding: 8 }}>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Service
          <select value={waServiceId} onChange={(e) => setWaServiceId(e.target.value)} style={{ display: "block", width: "100%", padding: 8 }}>
            {serviceOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Customer name (optional)
          <input value={waCustomerName} onChange={(e) => setWaCustomerName(e.target.value)} style={{ display: "block", width: "100%", padding: 8 }} />
        </label>
        <label>
          Customer phone
          <input
            value={waCustomerPhone}
            onChange={(e) => setWaCustomerPhone(e.target.value)}
            placeholder="2348012345678"
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>
        <button type="submit" disabled={submitting || !waStaffId || !waServiceId}>
          {submitting ? "Adding..." : "Add walk-in (starts now)"}
        </button>
      </form>
    </main>
  );
}
