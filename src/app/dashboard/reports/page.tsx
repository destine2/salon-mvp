"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
    <main style={page}>
      <Link href="/dashboard" style={backLink}>
        ← Dashboard
      </Link>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <h1 style={{ marginBottom: 0 }}>Daily reconciliation</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" style={{ maxWidth: 200 }} />
      </header>

      {error && <p className="error-text" style={{ marginTop: "var(--space-2)" }}>{error}</p>}

      {loading || !summary ? (
        <p style={{ color: "var(--color-ink-faint)", marginTop: "var(--space-3)" }}>Loading…</p>
      ) : (
        <>
          <div style={statGrid}>
            <Stat label="Appointments" value={summary.totalAppointments} />
            <Stat label="Completed & paid" value={summary.completedCount} />
            <Stat label="No-shows" value={summary.noShowCount} />
            <Stat label="Expected" value={`₦${summary.totalBooked.toLocaleString()}`} />
            <Stat label="Collected" value={`₦${summary.totalCollected.toLocaleString()}`} />
          </div>

          <section style={{ marginTop: "var(--space-4)" }}>
            <h2 style={{ fontSize: "1rem" }}>By payment method</h2>
            {Object.keys(summary.byMethod).length === 0 ? (
              <p style={{ color: "var(--color-ink-faint)" }}>Nothing collected yet today.</p>
            ) : (
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                {Object.entries(summary.byMethod).map(([method, amount]) => (
                  <span key={method} className="pill pill-neutral">
                    {method}: ₦{amount.toLocaleString()}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Placed above "Flagged" deliberately: an appointment nobody closed
              out is a bigger hole than one that under-collected, because it is
              money with no record at all. It should be the first thing the
              owner sees. */}
          <section style={{ marginTop: "var(--space-4)" }}>
            <h2 style={{ fontSize: "1rem", color: summary.unaccounted.count > 0 ? "var(--color-danger)" : undefined }}>
              Needs your attention ({summary.unaccounted.count})
            </h2>
            {summary.unaccounted.count === 0 ? (
              <p style={{ color: "var(--color-success)" }}>Every appointment today has been paid for, or marked no-show. Nothing outstanding.</p>
            ) : (
              <>
                <p>
                  These finished but were never checked out or marked no-show, so there is no record of whether the service happened or the money
                  came in — <strong style={{ color: "var(--color-ink)" }}>₦{summary.unaccounted.valueAtRiskNaira.toLocaleString()}</strong>{" "}
                  unaccounted for. Check each one out, or mark it no-show.
                </p>
                <div className="card" style={{ padding: 0, overflowX: "auto", borderColor: "var(--color-danger)" }}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Time</th>
                        <th style={th}>Customer</th>
                        <th style={th}>Staff</th>
                        <th style={th}>Service</th>
                        <th style={th}>Expected</th>
                        <th style={th} />
                      </tr>
                    </thead>
                    <tbody>
                      {summary.unaccounted.items.map((u) => (
                        <tr key={u.appointmentId} style={{ ...tr, background: "var(--color-danger-bg)" }}>
                          <td style={td}>{timeOf(u.startTime)}</td>
                          <td style={td}>{u.customer}</td>
                          <td style={td}>{u.staff}</td>
                          <td style={td}>{u.service}</td>
                          <td style={td}>₦{u.expected.toLocaleString()}</td>
                          <td style={td}>
                            <Link href={`/dashboard/checkout/${u.appointmentId}`} className="btn btn-primary btn-sm">
                              Check out
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {summary.integrityAnomalies.length > 0 && (
            <section style={{ marginTop: "var(--space-4)" }}>
              <h2 style={{ fontSize: "1rem", color: "var(--color-danger)" }}>Integrity anomalies ({summary.integrityAnomalies.length})</h2>
              <p>Marked complete with no payment record at all. This should not be possible through the app — check these individually.</p>
              <ul style={{ color: "var(--color-ink-soft)", paddingLeft: "1.2em" }}>
                {summary.integrityAnomalies.map((a) => (
                  <li key={a.appointmentId}>
                    {timeOf(a.startTime)} · {a.customer} · {a.staff} · {a.service} · ₦{a.expected.toLocaleString()}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section style={{ marginTop: "var(--space-4)" }}>
            <h2 style={{ fontSize: "1rem", color: summary.flagged.length > 0 ? "var(--color-warning)" : undefined }}>
              Flagged ({summary.flagged.length})
            </h2>
            {summary.flagged.length === 0 ? (
              <p style={{ color: "var(--color-success)" }}>Nothing flagged — every checkout collected at least the service price.</p>
            ) : (
              <div className="card" style={{ padding: 0, overflowX: "auto", borderColor: "var(--color-warning)" }}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Customer</th>
                      <th style={th}>Staff</th>
                      <th style={th}>Service</th>
                      <th style={th}>Expected</th>
                      <th style={th}>Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.flagged.map((f) => (
                      <tr key={f.appointmentId} style={{ ...tr, background: "var(--color-warning-bg)" }}>
                        <td style={td}>{f.customer}</td>
                        <td style={td}>{f.staff}</td>
                        <td style={td}>{f.service}</td>
                        <td style={td}>₦{f.expected.toLocaleString()}</td>
                        <td style={td}>₦{f.collected.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card" style={{ padding: "var(--space-3)" }}>
      <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase", color: "var(--color-ink-faint)" }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: "1.375rem", fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>{value}</p>
    </div>
  );
}

const page: React.CSSProperties = { padding: "var(--space-5)", maxWidth: 820, margin: "0 auto" };

const backLink: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--color-ink-faint)",
  marginBottom: "var(--space-3)",
};

const statGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: "var(--space-2)",
  marginTop: "var(--space-4)",
};

const table: React.CSSProperties = { width: "100%", minWidth: 560, borderCollapse: "collapse" };

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.02em",
  color: "var(--color-ink-faint)",
  textTransform: "uppercase",
  padding: "var(--space-2) var(--space-3)",
  borderBottom: "1px solid var(--color-border)",
};

const tr: React.CSSProperties = { borderBottom: "1px solid var(--color-border)" };

const td: React.CSSProperties = { padding: "var(--space-2) var(--space-3)", fontSize: "0.9375rem", verticalAlign: "middle" };
