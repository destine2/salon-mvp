"use client";

import { useEffect, useState } from "react";

type OpenItem = {
  appointmentId: string;
  customer: string;
  staff: string;
  service: string;
  startTime: string;
  expected: number;
};

type Summary = {
  totalAppointments: number;
  completedCount: number;
  noShowCount: number;
  totalBooked: number;
  totalCollected: number;
  byMethod: Record<string, number>;
  flagged: { appointmentId: string; customer: string; staff: string; service: string; expected: number; collected: number }[];
  unaccounted: { count: number; valueAtRiskNaira: number; items: OpenItem[] };
  integrityAnomalies: OpenItem[];
};

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [date, setDate] = useState(todayIso());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports/daily?date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Could not load report");
        setSummary(data.summary);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, [date]);

  return (
    <main style={{ padding: "2.5rem", maxWidth: 640 }}>
      <h1>Daily reconciliation</h1>
      <label>
        Date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: 6 }} />
      </label>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {loading || !summary ? (
        <p>Loading...</p>
      ) : (
        <>
          <ul style={{ marginTop: 16 }}>
            <li>Appointments today: {summary.totalAppointments}</li>
            <li>Completed & paid: {summary.completedCount}</li>
            <li>No-shows: {summary.noShowCount}</li>
            <li>Total expected (booked at service price): ₦{summary.totalBooked.toLocaleString()}</li>
            <li>Total actually collected: ₦{summary.totalCollected.toLocaleString()}</li>
          </ul>

          <h2>By payment method</h2>
          {Object.keys(summary.byMethod).length === 0 ? (
            <p>Nothing collected yet today.</p>
          ) : (
            <ul>
              {Object.entries(summary.byMethod).map(([method, amount]) => (
                <li key={method}>
                  {method}: ₦{amount.toLocaleString()}
                </li>
              ))}
            </ul>
          )}

          {/* Placed above "Flagged" deliberately: an appointment nobody closed
              out is a bigger hole than one that under-collected, because it is
              money with no record at all. It should be the first thing the
              owner sees. */}
          <h2 style={{ color: summary.unaccounted.count > 0 ? "crimson" : undefined }}>
            Needs your attention ({summary.unaccounted.count})
          </h2>
          {summary.unaccounted.count === 0 ? (
            <p>Every appointment today has been paid for, or marked no-show. Nothing outstanding.</p>
          ) : (
            <>
              <p style={{ margin: "0 0 8px" }}>
                These finished but were never checked out or marked no-show, so there is no record
                of whether the service happened or the money came in —{" "}
                <strong>₦{summary.unaccounted.valueAtRiskNaira.toLocaleString()}</strong> unaccounted
                for. Check each one out, or mark it no-show.
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                    <th>Time</th>
                    <th>Customer</th>
                    <th>Staff</th>
                    <th>Service</th>
                    <th>Expected</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {summary.unaccounted.items.map((u) => (
                    <tr key={u.appointmentId} style={{ borderBottom: "1px solid #eee", background: "#fdecea" }}>
                      <td>{timeOf(u.startTime)}</td>
                      <td>{u.customer}</td>
                      <td>{u.staff}</td>
                      <td>{u.service}</td>
                      <td>₦{u.expected.toLocaleString()}</td>
                      <td>
                        <a href={`/dashboard/checkout/${u.appointmentId}`}>Check out</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {summary.integrityAnomalies.length > 0 && (
            <>
              <h2 style={{ color: "crimson" }}>
                Integrity anomalies ({summary.integrityAnomalies.length})
              </h2>
              <p>
                Marked complete with no payment record at all. This should not be possible through
                the app — check these individually.
              </p>
              <ul>
                {summary.integrityAnomalies.map((a) => (
                  <li key={a.appointmentId}>
                    {timeOf(a.startTime)} · {a.customer} · {a.staff} · {a.service} · ₦
                    {a.expected.toLocaleString()}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 style={{ color: summary.flagged.length > 0 ? "#b8860b" : undefined }}>
            Flagged ({summary.flagged.length})
          </h2>
          {summary.flagged.length === 0 ? (
            <p>Nothing flagged — every checkout collected at least the service price.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th>Customer</th>
                  <th>Staff</th>
                  <th>Service</th>
                  <th>Expected</th>
                  <th>Collected</th>
                </tr>
              </thead>
              <tbody>
                {summary.flagged.map((f) => (
                  <tr key={f.appointmentId} style={{ borderBottom: "1px solid #eee", background: "#fff8e1" }}>
                    <td>{f.customer}</td>
                    <td>{f.staff}</td>
                    <td>{f.service}</td>
                    <td>₦{f.expected.toLocaleString()}</td>
                    <td>₦{f.collected.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}
