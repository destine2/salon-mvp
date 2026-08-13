"use client";

import { useEffect, useState } from "react";

type Summary = {
  totalAppointments: number;
  completedCount: number;
  noShowCount: number;
  totalBooked: number;
  totalCollected: number;
  byMethod: Record<string, number>;
  flagged: { appointmentId: string; customer: string; staff: string; service: string; expected: number; collected: number }[];
};

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
