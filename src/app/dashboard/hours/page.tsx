"use client";

import { useEffect, useState } from "react";

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

  if (loading) return <main style={{ padding: "2.5rem" }}>Loading...</main>;

  return (
    <main style={{ padding: "2.5rem", maxWidth: 560 }}>
      <h1>Opening hours</h1>
      <p style={{ color: "#5a544c", lineHeight: 1.6 }}>
        Customers can only book inside these hours. Times are Lagos time.
      </p>

      {neverConfigured && (
        <p style={{ background: "#fff8e1", padding: "0.75rem 1rem", lineHeight: 1.6 }}>
          You haven&apos;t set your hours yet, so bookings currently use the default 9:00–19:00,
          every day. Set your real hours below.
        </p>
      )}

      <div style={{ marginTop: 20 }}>
        {DAYS.map((d) => {
          const day = state[d.weekday];
          return (
            <div
              key={d.weekday}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: "1px solid #eee",
              }}
            >
              <label style={{ width: 130, display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={day.open}
                  onChange={(e) => update(d.weekday, { open: e.target.checked })}
                />
                {d.label}
              </label>
              {day.open ? (
                <>
                  <input
                    type="time"
                    value={day.opens}
                    onChange={(e) => update(d.weekday, { opens: e.target.value })}
                    style={{ padding: 6 }}
                  />
                  <span>to</span>
                  <input
                    type="time"
                    value={day.closes}
                    onChange={(e) => update(d.weekday, { closes: e.target.value })}
                    style={{ padding: 6 }}
                  />
                </>
              ) : (
                <span style={{ color: "#999" }}>Closed</span>
              )}
            </div>
          );
        })}
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {message && <p style={{ color: "#1d7a4c" }}>{message}</p>}

      <button onClick={save} disabled={saving} style={{ marginTop: 20, padding: "0.7rem 1.4rem" }}>
        {saving ? "Saving..." : "Save hours"}
      </button>
    </main>
  );
}
