"use client";

import { useEffect, useState } from "react";

type EarningsEntry = { id: string; amount: number; service: string; customer: string; date: string };

export default function EarningsPage() {
  const [todayTotal, setTodayTotal] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  const [recent, setRecent] = useState<EarningsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/earnings")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Could not load earnings");
        setTodayTotal(data.todayTotal);
        setWeekTotal(data.weekTotal);
        setRecent(data.recent);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ padding: "2.5rem", maxWidth: 480 }}>
      <h1>My earnings</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <p style={{ fontSize: "1.4rem" }}>Today: ₦{todayTotal.toLocaleString()}</p>
          <p style={{ color: "#666" }}>Last 7 days: ₦{weekTotal.toLocaleString()}</p>

          <h2 style={{ marginTop: 24 }}>Recent</h2>
          {recent.length === 0 ? (
            <p>Nothing checked out yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Your share</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td>{new Date(r.date).toLocaleDateString()}</td>
                    <td>{r.customer}</td>
                    <td>{r.service}</td>
                    <td>₦{r.amount.toLocaleString()}</td>
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
