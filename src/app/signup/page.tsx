"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [salonName, setSalonName] = useState("");
  const [city, setCity] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonName, city, ownerName, phone, password }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not create your account");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={authPage}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: "var(--space-5)" }}>
          <span className="app-wordmark" style={{ color: "var(--color-ink)" }}>
            Salon<span className="app-wordmark-accent">MVP</span>
          </span>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: "var(--space-1)" }}>Set up your salon</h2>
          <p style={{ marginBottom: "var(--space-4)" }}>You&rsquo;ll be logged in right away.</p>

          <form onSubmit={handleSignup}>
            <label className="field">
              <span className="field-label">Salon name</span>
              <input value={salonName} onChange={(e) => setSalonName(e.target.value)} required className="input" />
            </label>
            <label className="field">
              <span className="field-label">City (optional)</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} className="input" />
            </label>
            <label className="field">
              <span className="field-label">Your name</span>
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required className="input" />
            </label>
            <label className="field">
              <span className="field-label">Phone number (this is how you&rsquo;ll log in)</span>
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
                minLength={8}
                required
                className="input"
              />
            </label>
            <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%", marginTop: "var(--space-2)" }}>
              {loading ? "Creating your salon…" : "Create salon"}
            </button>
          </form>

          {error && <p className="error-text" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>{error}</p>}
        </div>

        <p style={{ textAlign: "center", marginTop: "var(--space-4)" }}>
          Already have an account? <Link href="/login">Log in</Link>
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
