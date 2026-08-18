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
    <main style={{ padding: "2.5rem", maxWidth: 380 }}>
      <h1>Set up your salon</h1>
      <p>Create your salon and owner account — you'll be logged in right away.</p>

      <form onSubmit={handleSignup}>
        <label>
          Salon name
          <input
            value={salonName}
            onChange={(e) => setSalonName(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8, margin: "8px 0" }}
          />
        </label>
        <label>
          City (optional)
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            style={{ display: "block", width: "100%", padding: 8, margin: "8px 0" }}
          />
        </label>
        <label>
          Your name
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8, margin: "8px 0" }}
          />
        </label>
        <label>
          Phone number (this is how you'll log in)
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="2348012345678"
            required
            style={{ display: "block", width: "100%", padding: 8, margin: "8px 0" }}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            style={{ display: "block", width: "100%", padding: 8, margin: "8px 0" }}
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Creating your salon..." : "Create salon"}
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <p style={{ marginTop: "1.5rem" }}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
