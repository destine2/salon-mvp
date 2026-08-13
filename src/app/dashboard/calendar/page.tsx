"use client";

import { useEffect, useState, type FormEvent } from "react";
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

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [apptRes, staffRes, serviceRes] = await Promise.all([
        fetch(`/api/appointments?date=${date}`),
        fetch("/api/staff"),
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
                  <tr key={a.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td>{new Date(a.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                    <td>
                      {a.customer.name || "—"} ({a.customer.phone}){a.isWalkIn ? " · walk-in" : ""}
                    </td>
                    <td>{a.service.name}</td>
                    <td>{a.status}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      {(a.status === "BOOKED" || a.status === "CONFIRMED") && (
                        <>
                          {a.status === "BOOKED" && (
                            <button onClick={() => updateStatus(a.id, "CONFIRMED")}>Confirm</button>
                          )}
                          <Link href={`/dashboard/checkout/${a.id}`}>Checkout</Link>
                          <button onClick={() => updateStatus(a.id, "NO_SHOW")}>No-show</button>
                          <button onClick={() => updateStatus(a.id, "CANCELLED")}>Cancel</button>
                        </>
                      )}
                      {a.status === "COMPLETED" && a.transaction && <span>Paid ✓</span>}
                    </td>
                  </tr>
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
