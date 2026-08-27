"use client";

// The page a customer lands on from the salon's shared WhatsApp booking
// link (PRD 7.1). No login, no app download — pick a service, a stylist,
// a time, and confirm with just a phone number.
//
// Note: this is a plain web page reached via a link, not a full
// conversational WhatsApp bot flow — that requires the WhatsApp Cloud API
// template/session machinery, which needs Meta Business verification to be
// live first (see task #16 and PRD section 8.2 note). A shared link that
// opens a page still satisfies "no app download," and this same booking
// logic (src/app/api/public/book) is what a future conversational flow
// would call into.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Service = { id: string; name: string; priceNaira: string; durationMin: number };
type StaffOption = { id: string; name: string };
type Salon = { id: string; name: string; city: string | null; services: Service[]; staff: StaffOption[] };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function PublicBookingPage() {
  const params = useParams<{ salonId: string }>();
  const salonId = params.salonId;

  const [salon, setSalon] = useState<Salon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/public/salons/${salonId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Salon not found");
        setSalon(data.salon);
        setServiceId(data.salon.services[0]?.id ?? "");
        setStaffId(data.salon.staff[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, [salonId]);

  useEffect(() => {
    if (!serviceId || !staffId || !date) return;
    setSlotsLoading(true);
    setSelectedSlot(null);
    fetch(`/api/public/availability?staffId=${staffId}&serviceId=${serviceId}&date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Could not load available times");
        setSlots(data.slots);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setSlotsLoading(false));
  }, [serviceId, staffId, date]);

  async function handleConfirm() {
    if (!selectedSlot) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId,
          staffId,
          serviceId,
          startTime: selectedSlot,
          customerName: name || undefined,
          customerPhone: phone,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not book that slot");
      setConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main style={page}>
        <p style={{ color: "var(--color-ink-faint)" }}>Loading…</p>
      </main>
    );
  }

  if (!salon) {
    return (
      <main style={page}>
        <p className="error-text">{error ?? "Salon not found"}</p>
      </main>
    );
  }

  if (confirmed) {
    return (
      <main style={page}>
        <div style={{ maxWidth: 440, margin: "0 auto", textAlign: "center", paddingTop: "10vh" }}>
          <div style={checkCircle}>✓</div>
          <h1 style={{ marginTop: "var(--space-4)" }}>You&rsquo;re booked</h1>
          <p style={{ fontSize: "1.0625rem" }}>
            {salon.name} is expecting you{" "}
            <strong style={{ color: "var(--color-ink)" }}>
              {new Date(selectedSlot!).toLocaleString([], {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </strong>
            . See you then.
          </p>
        </div>
      </main>
    );
  }

  const selectedService = salon.services.find((s) => s.id === serviceId);

  return (
    <main style={page}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <header style={{ marginBottom: "var(--space-5)" }}>
          <p style={eyebrow}>Book your appointment</p>
          <h1>{salon.name}</h1>
          {salon.city && <p style={{ color: "var(--color-ink-faint)", marginBottom: 0 }}>{salon.city}</p>}
        </header>

        {error && <p className="error-text" style={{ marginBottom: "var(--space-3)" }}>{error}</p>}

        <section style={{ marginBottom: "var(--space-5)" }}>
          <p style={sectionLabel}>1. Choose a service</p>
          <div style={cardGrid}>
            {salon.services.map((s) => (
              <label key={s.id} style={selectCard(serviceId === s.id)}>
                <input
                  type="radio"
                  name="service"
                  value={s.id}
                  checked={serviceId === s.id}
                  onChange={() => setServiceId(s.id)}
                  style={{ position: "absolute", opacity: 0 }}
                />
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span style={{ color: "var(--color-ink-faint)", fontSize: "0.875rem" }}>
                  ₦{Number(s.priceNaira).toLocaleString()} · {s.durationMin} min
                </span>
              </label>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: "var(--space-5)" }}>
          <p style={sectionLabel}>2. Choose a stylist</p>
          <div style={cardGrid}>
            {salon.staff.map((s) => (
              <label key={s.id} style={selectCard(staffId === s.id)}>
                <input
                  type="radio"
                  name="staff"
                  value={s.id}
                  checked={staffId === s.id}
                  onChange={() => setStaffId(s.id)}
                  style={{ position: "absolute", opacity: 0 }}
                />
                <span style={{ fontWeight: 600 }}>{s.name}</span>
              </label>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: "var(--space-5)" }}>
          <p style={sectionLabel}>3. Pick a date and time</p>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
            style={{ maxWidth: 220, marginBottom: "var(--space-3)" }}
          />

          {slotsLoading ? (
            <p style={{ color: "var(--color-ink-faint)" }}>Checking availability…</p>
          ) : slots.length === 0 ? (
            <p style={{ color: "var(--color-ink-faint)" }}>No open slots that day — try another date.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {slots.map((s) => (
                <button key={s} onClick={() => setSelectedSlot(s)} style={slotButton(selectedSlot === s)}>
                  {new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedSlot && (
          <section className="card" style={{ animation: "fadeIn 0.35s ease" }}>
            <p style={sectionLabel}>4. Your details</p>
            <label className="field">
              <span className="field-label">Your name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
            </label>
            <label className="field">
              <span className="field-label">Your phone (WhatsApp number)</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="2348012345678"
                required
                className="input"
              />
            </label>
            <button onClick={handleConfirm} disabled={submitting || !phone} className="btn btn-primary" style={{ width: "100%" }}>
              {submitting
                ? "Booking…"
                : `Confirm — ${selectedService ? "₦" + Number(selectedService.priceNaira).toLocaleString() : ""}`}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: "var(--space-5) var(--space-3) var(--space-6)",
  background: "var(--color-cream)",
};

const eyebrow: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--color-gold-dark)",
  marginBottom: "var(--space-1)",
};

const sectionLabel: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "0.8125rem",
  fontWeight: 700,
  letterSpacing: "0.02em",
  color: "var(--color-ink-soft)",
  marginBottom: "var(--space-2)",
};

const cardGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: "var(--space-2)",
};

function selectCard(active: boolean): React.CSSProperties {
  return {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "var(--space-2) var(--space-3)",
    borderRadius: "var(--radius-sm)",
    border: active ? "1.5px solid var(--color-gold)" : "1px solid var(--color-border)",
    background: active ? "rgba(var(--color-gold-rgb), 0.08)" : "var(--color-surface)",
    cursor: "pointer",
    transition: "border-color 0.35s ease, background 0.35s ease, box-shadow 0.35s ease",
    boxShadow: active ? "var(--shadow-card)" : "none",
  };
}

function slotButton(active: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-body)",
    fontSize: "0.875rem",
    fontWeight: 600,
    padding: "0.55em 0.9em",
    borderRadius: "var(--radius-sm)",
    border: active ? "1.5px solid var(--color-gold)" : "1px solid var(--color-border)",
    background: active ? "var(--color-gold)" : "var(--color-surface)",
    color: active ? "#fff" : "var(--color-ink)",
    cursor: "pointer",
    transition: "all 0.35s ease",
  };
}

const checkCircle: React.CSSProperties = {
  width: 64,
  height: 64,
  margin: "0 auto",
  borderRadius: "50%",
  background: "var(--color-success-bg)",
  color: "var(--color-success)",
  fontSize: "1.75rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
