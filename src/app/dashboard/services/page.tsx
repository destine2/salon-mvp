"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

type Service = {
  id: string;
  name: string;
  priceNaira: string; // Decimal fields arrive as strings over JSON
  durationMin: number;
};

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("60");
  const [submitting, setSubmitting] = useState(false);

  async function loadServices() {
    setLoading(true);
    try {
      const res = await fetch("/api/services");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not load services");
      setServices(data.services);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServices();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          priceNaira: Number(price),
          durationMin: Number(duration) || 60,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not add service");
      setName("");
      setPrice("");
      setDuration("60");
      await loadServices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/services/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not remove service");
      await loadServices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <main style={page}>
      <Link href="/dashboard" style={backLink}>
        ← Dashboard
      </Link>
      <h1>Services</h1>
      <p>What you charge for, and how long each one takes — needed before booking can work.</p>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p style={{ color: "var(--color-ink-faint)" }}>Loading…</p>
      ) : services.length === 0 ? (
        <p style={{ color: "var(--color-ink-faint)" }}>No services yet — add your first one below.</p>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto", marginBottom: "var(--space-4)" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Price (₦)</th>
                <th style={th}>Duration (min)</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} style={tr}>
                  <td style={td}>{s.name}</td>
                  <td style={td}>{Number(s.priceNaira).toLocaleString()}</td>
                  <td style={td}>{s.durationMin}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <button onClick={() => handleDelete(s.id)} className="btn btn-danger btn-sm">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ maxWidth: 360 }}>
        <h2 style={{ marginBottom: "var(--space-3)" }}>Add a service</h2>
        <form onSubmit={handleAdd}>
          <label className="field">
            <span className="field-label">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
          </label>
          <label className="field">
            <span className="field-label">Price (₦)</span>
            <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required className="input" />
          </label>
          <label className="field">
            <span className="field-label">Duration (minutes)</span>
            <input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} className="input" />
          </label>
          <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: "100%" }}>
            {submitting ? "Adding…" : "Add service"}
          </button>
        </form>
      </div>
    </main>
  );
}

const page: React.CSSProperties = { padding: "var(--space-5)", maxWidth: 780, margin: "0 auto" };

const backLink: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--color-ink-faint)",
  marginBottom: "var(--space-3)",
};

const table: React.CSSProperties = { width: "100%", minWidth: 460, borderCollapse: "collapse" };

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
