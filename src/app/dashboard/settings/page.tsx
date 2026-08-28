"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const [depositPercent, setDepositPercent] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/salon")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Could not load settings");
        setDepositPercent(String(data.salon.depositPercent));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const res = await fetch("/api/salon", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositPercent: Number(depositPercent) }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not save settings");
      setMessage(
        Number(depositPercent) === 0
          ? "Saved. Deposits are off — bookings go straight through, same as before."
          : `Saved. New bookings now hold the slot for 10 minutes and require a ${depositPercent}% deposit before they're confirmed.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={page}>
      <Link href="/dashboard" style={backLink}>
        ← Dashboard
      </Link>
      <h1>Settings</h1>

      {loading ? (
        <p style={{ color: "var(--color-ink-faint)" }}>Loading…</p>
      ) : (
        <div className="card" style={{ maxWidth: 420 }}>
          <h2 style={{ marginBottom: "var(--space-1)" }}>Deposits</h2>
          <p>
            When set above 0%, a customer booking online must pay this percentage of the service price within 10
            minutes to hold their slot — nobody else can take it while they pay, and it&rsquo;s released automatically
            if they don&rsquo;t. Walk-ins and bookings you add yourself are never affected.
          </p>

          <form onSubmit={handleSave}>
            <label className="field">
              <span className="field-label">Deposit percentage</span>
              <input
                type="number"
                min="0"
                max="100"
                value={depositPercent}
                onChange={(e) => setDepositPercent(e.target.value)}
                className="input"
                style={{ maxWidth: 140 }}
              />
            </label>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? "Saving…" : "Save"}
            </button>
          </form>

          {error && <p className="error-text" style={{ marginTop: "var(--space-3)" }}>{error}</p>}
          {message && <p style={{ color: "var(--color-success)", marginTop: "var(--space-3)" }}>{message}</p>}
        </div>
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
