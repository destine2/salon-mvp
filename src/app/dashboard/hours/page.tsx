"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const DAYS = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 0, label: "Sunday" },
];

type DayState = { open: boolean; opens: string; closes: string };

const DEFAULT_DAY: DayState = { open: true, opens: "09:00", closes: "19:00" };

export default function HoursPage() {
  const [state, setState] = useState<Record<number, DayState>>(() =>
    Object.fromEntries(DAYS.map((d) => [d.weekday, { ...DEFAULT_DAY }]))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [neverConfigured, setNeverConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/business-hours")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Could not load hours");
        if (data.hours.length === 0) {
          setNeverConfigured(true);
          return;
        }
        const next = Object.fromEntries(
          DAYS.map((d) => [d.weekday, { open: false, opens: "09:00", closes: "19:00" }])
        ) as Record<number, DayState>;
        for (const h of data.hours as { weekday: number; opens: string; closes: string }[]) {
          next[h.weekday] = { open: true, opens: h.opens, closes: h.closes };
        }
        setState(next);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, []);

  function update(weekday: number, patch: Partial<DayState>) {
    setState((prev) => ({ ...prev, [weekday]: { ...prev[weekday], ...patch } }));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const hours = DAYS.filter((d) => state[d.weekday].open).map((d) => ({
        weekday: d.weekday,
        opens: state[d.weekday].opens,
        closes: state[d.weekday].closes,
      }));
      const res = await fetch("/api/business-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not save");
      setNeverConfigured(false);
      setMessage(
        hours.length === 0
          ? "Saved — but every day is closed, so nobody can book. Open at least one day."
          : `Saved. Open ${hours.length} ${hours.length === 1 ? "day" : "days"} a week.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main style={page}>
        <p style={{ color: "var(--color-ink-faint)" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={page}>
      <Link href="/dashboard" style={backLink}>
        ← Dashboard
      </Link>
      <h1>Opening hours</h1>
      <p>Customers can only book inside these hours. Times are Lagos time.</p>

      {neverConfigured && (
        <div className="card" style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)", marginBottom: "var(--space-4)" }}>
          <p style={{ margin: 0, color: "var(--color-ink)" }}>
            You haven&rsquo;t set your hours yet, so bookings currently use the default 9:00–19:00, every day. Set your real hours below.
          </p>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {DAYS.map((d, i) => {
          const day = state[d.weekday];
          return (
            <div key={d.weekday} style={{ ...dayRow, borderBottom: i === DAYS.length - 1 ? "none" : "1px solid var(--color-border)" }}>
              <label style={{ width: 140, display: "flex", alignItems: "center", gap: "var(--space-2)", fontWeight: 600 }}>
                <input type="checkbox" checked={day.open} onChange={(e) => update(d.weekday, { open: e.target.checked })} />
                {d.label}
              </label>
              {day.open ? (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <input type="time" value={day.opens} onChange={(e) => update(d.weekday, { opens: e.target.value })} className="input" />
                  <span style={{ color: "var(--color-ink-faint)" }}>to</span>
                  <input type="time" value={day.closes} onChange={(e) => update(d.weekday, { closes: e.target.value })} className="input" />
                </div>
              ) : (
                <span className="pill pill-neutral">Closed</span>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="error-text" style={{ marginTop: "var(--space-3)" }}>{error}</p>}
      {message && <p style={{ color: "var(--color-success)", marginTop: "var(--space-3)" }}>{message}</p>}

      <button onClick={save} disabled={saving} className="btn btn-primary" style={{ marginTop: "var(--space-4)" }}>
        {saving ? "Saving…" : "Save hours"}
      </button>
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

const dayRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-3)",
  padding: "var(--space-3)",
  flexWrap: "wrap",
};
