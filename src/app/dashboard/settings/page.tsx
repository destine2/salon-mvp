"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const [depositPercent, setDepositPercent] = useState("0");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [site, setSite] = useState({ contactPhone: "", whatsappNumber: "", address: "" });
  const [siteSaving, setSiteSaving] = useState(false);
  const [siteMessage, setSiteMessage] = useState<string | null>(null);
  const [siteError, setSiteError] = useState<string | null>(null);
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
        setNotifyEmail(data.salon.notifyEmail ?? "");
        setSite({ contactPhone: data.salon.contactPhone ?? "", whatsappNumber: data.salon.whatsappNumber ?? "", address: data.salon.address ?? "" });
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

  async function handleSaveEmail(e: FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setEmailMessage(null);
    setEmailSaving(true);
    try {
      const res = await fetch("/api/salon", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyEmail }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not save");
      setEmailMessage(notifyEmail ? `Saved. New-booking alerts will go to ${notifyEmail}.` : "Saved. Booking alerts are off.");
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleSaveSite(e: FormEvent) {
    e.preventDefault();
    setSiteError(null);
    setSiteMessage(null);
    setSiteSaving(true);
    try {
      const res = await fetch("/api/salon", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(site),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not save");
      setSiteMessage("Saved. Your website will show this within a minute.");
    } catch (err) {
      setSiteError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSiteSaving(false);
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

      {!loading && (
        <div className="card" style={{ maxWidth: 420, marginTop: "var(--space-4)" }}>
          <h2 style={{ marginBottom: "var(--space-1)" }}>Booking alerts</h2>
          <p>
            We email this address every time a customer books, with who, what and when. Customers who give an email
            address also get a confirmation and reminders (3 days before, 1 day before, the morning of, and 2 hours
            before).
          </p>
          <form onSubmit={handleSaveEmail}>
            <label className="field">
              <span className="field-label">Alert email</span>
              <input type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} placeholder="you@example.com" className="input" />
            </label>
            <button type="submit" disabled={emailSaving} className="btn btn-primary">
              {emailSaving ? "Saving…" : "Save"}
            </button>
          </form>
          {emailError && <p className="error-text" style={{ marginTop: "var(--space-3)" }}>{emailError}</p>}
          {emailMessage && <p style={{ color: "var(--color-success)", marginTop: "var(--space-3)" }}>{emailMessage}</p>}
        </div>
      )}
      {!loading && (
        <div className="card" style={{ maxWidth: 420, marginTop: "var(--space-4)" }}>
          <h2 style={{ marginBottom: "var(--space-1)" }}>Website details</h2>
          <p>
            Your website reads these live, so changes appear there without anyone rebuilding it. Prices come from{" "}
            <Link href="/dashboard/services" style={{ textDecoration: "underline" }}>Services</Link> and opening times
            from <Link href="/dashboard/hours" style={{ textDecoration: "underline" }}>Opening hours</Link>.
          </p>
          <form onSubmit={handleSaveSite}>
            <label className="field">
              <span className="field-label">Phone</span>
              <input value={site.contactPhone} onChange={(e) => setSite({ ...site, contactPhone: e.target.value })} placeholder="+234 801 234 5678" className="input" />
            </label>
            <label className="field">
              <span className="field-label">WhatsApp number (digits only, with country code)</span>
              <input value={site.whatsappNumber} onChange={(e) => setSite({ ...site, whatsappNumber: e.target.value })} placeholder="2348012345678" className="input" />
            </label>
            <label className="field">
              <span className="field-label">Address</span>
              <input value={site.address} onChange={(e) => setSite({ ...site, address: e.target.value })} placeholder="14 Admiralty Way, Lekki Phase 1, Lagos" className="input" />
            </label>
            <button type="submit" disabled={siteSaving} className="btn btn-primary">
              {siteSaving ? "Saving…" : "Save"}
            </button>
          </form>
          {siteError && <p className="error-text" style={{ marginTop: "var(--space-3)" }}>{siteError}</p>}
          {siteMessage && <p style={{ color: "var(--color-success)", marginTop: "var(--space-3)" }}>{siteMessage}</p>}
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
