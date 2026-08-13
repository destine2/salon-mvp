"use client";

import { useEffect, useState, type FormEvent } from "react";

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
    <main style={{ padding: "2.5rem", maxWidth: 640 }}>
      <h1>Services</h1>
      <p>What you charge for, and how long each one takes — needed before booking can work.</p>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {loading ? (
        <p>Loading...</p>
      ) : services.length === 0 ? (
        <p>No services yet — add your first one below.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", margin: "1rem 0" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th>Name</th>
              <th>Price (₦)</th>
              <th>Duration (min)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{s.name}</td>
                <td>{Number(s.priceNaira).toLocaleString()}</td>
                <td>{s.durationMin}</td>
                <td>
                  <button onClick={() => handleDelete(s.id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Add a service</h2>
      <form onSubmit={handleAdd} style={{ display: "grid", gap: 8, maxWidth: 320 }}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ display: "block", width: "100%", padding: 8 }} />
        </label>
        <label>
          Price (₦)
          <input
            type="number"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>
        <label>
          Duration (minutes)
          <input
            type="number"
            min="1"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Adding..." : "Add service"}
        </button>
      </form>
    </main>
  );
}
