"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not log in");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={authPage}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: "var(--space-5)" }}>
          <span className="app-wordmark" style={{ color: "var(--color-ink)" }}>
            Salon<span className="app-wordmark-accent">MVP</span>
          </span>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: "var(--space-4)" }}>Log in</h2>

          <form onSubmit={handleLogin}>
            <label className="field">
              <span className="field-label">Phone number</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="2348012345678"
                required
                className="input"
              />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input"
              />
            </label>
            <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%", marginTop: "var(--space-2)" }}>
              {loading ? "Logging in…" : "Log in"}
            </button>
          </form>

          {error && <p className="error-text" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>{error}</p>}
        </div>

        <p style={{ textAlign: "center", marginTop: "var(--space-4)" }}>
          New salon? <Link href="/signup">Set up your salon</Link>
        </p>
      </div>
    </main>
  );
}

const authPage: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--space-4)",
  background: "var(--color-cream)",
};
