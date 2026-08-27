"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
    <main style={page}>
      <Link href="/dashboard" style={backLink}>
        ← Dashboard
      </Link>
      <h1>My earnings</h1>
      {error && <p className="error-text">{error}</p>}
      {loading ? (
        <p style={{ color: "var(--color-ink-faint)" }}>Loading…</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
            <div className="card" style={{ padding: "var(--space-3)", minWidth: 160 }}>
              <p style={statLabel}>Today</p>
              <p style={statValue}>₦{todayTotal.toLocaleString()}</p>
            </div>
            <div className="card" style={{ padding: "var(--space-3)", minWidth: 160 }}>
              <p style={statLabel}>Last 7 days</p>
              <p style={statValue}>₦{weekTotal.toLocaleString()}</p>
            </div>
          </div>

          <h2 style={{ fontSize: "1rem" }}>Recent</h2>
          {recent.length === 0 ? (
            <p style={{ color: "var(--color-ink-faint)" }}>Nothing checked out yet.</p>
          ) : (
            <div className="card" style={{ padding: 0, overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={th}>Customer</th>
                    <th style={th}>Service</th>
                    <th style={th}>Your share</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} style={tr}>
                      <td style={td}>{new Date(r.date).toLocaleDateString()}</td>
                      <td style={td}>{r.customer}</td>
                      <td style={td}>{r.service}</td>
                      <td style={{ ...td, fontWeight: 700, color: "var(--color-ink)" }}>₦{r.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}

const page: React.CSSProperties = { padding: "var(--space-5)", maxWidth: 640, margin: "0 auto" };

const backLink: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--color-ink-faint)",
  marginBottom: "var(--space-3)",
};

const statLabel: React.CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  color: "var(--color-ink-faint)",
};

const statValue: React.CSSProperties = {
  margin: 0,
  fontSize: "1.5rem",
  fontWeight: 700,
  fontFamily: "var(--font-display)",
  color: "var(--color-ink)",
};

const table: React.CSSProperties = { width: "100%", minWidth: 420, borderCollapse: "collapse" };

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

const td: React.CSSProperties = { padding: "var(--space-2) var(--space-3)", fontSize: "0.9375rem" };
