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
import { DRAPING_OPTIONS, SKIN_TYPES } from "@/lib/intake";

type Service = { id: string; name: string; priceNaira: string; durationMin: number };
type StaffOption = { id: string; name: string };
type Salon = {
  id: string;
  name: string;
  city: string | null;
  depositPercent: number;
  services: Service[];
  staff: StaffOption[];
};

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
  const [areasOfFocus, setAreasOfFocus] = useState("");
  const [draping, setDraping] = useState<string>("");
  const [skinType, setSkinType] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Set once /api/public/book returns requiresDeposit: true — the
  // appointment is HELD (10-minute window) and the customer is one click
  // from being redirected to pay it. Distinct from `confirmed`, which is
  // only reached once a booking needs no deposit at all, or a deposit is
  // already paid.
  const [pendingDeposit, setPendingDeposit] = useState<{ appointmentId: string; amountNaira: number } | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [startingPayment, setStartingPayment] = useState(false);

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
    fetch(`/api/public/availability?salonId=${salonId}&staffId=${staffId}&serviceId=${serviceId}&date=${date}`)
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
          customerEmail: email || undefined,
          intake: {
            areasOfFocus: areasOfFocus || undefined,
            draping: draping || undefined,
            skinType: skinType || undefined,
            notes: notes || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not book that slot");
      if (data.requiresDeposit) {
        setPendingDeposit({ appointmentId: data.appointmentId, amountNaira: data.depositAmountNaira });
      } else {
        setConfirmed(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePayDeposit() {
    if (!pendingDeposit) return;
    setDepositError(null);
    setStartingPayment(true);
    try {
      const res = await fetch(`/api/public/book/${pendingDeposit.appointmentId}/deposit`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not start the deposit payment");
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setDepositError(err instanceof Error ? err.message : "Something went wrong");
      setStartingPayment(false);
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

  if (pendingDeposit) {
    return (
      <main style={page}>
        <div style={{ maxWidth: 440, margin: "0 auto", textAlign: "center", paddingTop: "10vh" }}>
          <h1>Your slot is on hold</h1>
          <p style={{ fontSize: "1.0625rem" }}>
            Pay the ₦{pendingDeposit.amountNaira.toLocaleString()} deposit within the next 10 minutes to confirm it —
            after that, it&rsquo;s released for someone else to book.
          </p>
          {depositError && <p className="error-text">{depositError}</p>}
          <button onClick={handlePayDeposit} disabled={startingPayment} className="btn btn-primary" style={{ width: "100%", maxWidth: 320 }}>
            {startingPayment ? "Starting payment…" : `Pay deposit — ₦${pendingDeposit.amountNaira.toLocaleString()}`}
          </button>
        </div>
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
        <header style={hero}>
          <p style={{ ...eyebrow, color: "var(--color-gold)" }}>Book your appointment</p>
          <h1 style={{ color: "#F1EAE0", marginBottom: 6 }}>{salon.name}</h1>
          {salon.city && <p style={{ color: "rgba(241,234,224,0.7)", margin: 0 }}>{salon.city}</p>}
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
          <div style={{ animation: "fadeIn 0.35s ease" }}>
            <section className="card" style={{ marginBottom: "var(--space-4)" }}>
              <p style={sectionLabel}>4. Your consultation <span style={optional}>(optional, helps us prepare)</span></p>

              <p style={miniLabel}>Draping preference</p>
              <div style={chipRow}>
                {DRAPING_OPTIONS.map((o) => (
                  <button key={o.value} type="button" onClick={() => setDraping(draping === o.value ? "" : o.value)} style={chip(draping === o.value)} title={o.hint}>
                    {o.label}
                  </button>
                ))}
              </div>

              <p style={miniLabel}>Skin type</p>
              <div style={chipRow}>
                {SKIN_TYPES.map((t) => (
                  <button key={t} type="button" onClick={() => setSkinType(skinType === t ? "" : t)} style={chip(skinType === t)}>
                    {t}
                  </button>
                ))}
              </div>

              <label className="field">
                <span className="field-label">Areas of concern or focus</span>
                <textarea
                  value={areasOfFocus}
                  onChange={(e) => setAreasOfFocus(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="e.g. tight shoulders, scalp sensitivity"
                  className="input"
                  style={{ resize: "vertical" }}
                />
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span className="field-label">Anything else we should know (allergies, injuries)</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} className="input" style={{ resize: "vertical" }} />
              </label>
            </section>

            <section className="card">
              <p style={sectionLabel}>5. Your details</p>
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
              <label className="field">
                <span className="field-label">Email <span style={optional}>(optional — for your confirmation and reminders)</span></span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="input" />
              </label>

              <label style={consentBox}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3, accentColor: "var(--color-gold)" }} />
                <span>
                  I understand and agree to the salon&rsquo;s booking policies:
                  <ul style={{ margin: "6px 0 0", paddingLeft: "1.1em" }}>
                    {salon.depositPercent > 0 && (
                      <li>A {salon.depositPercent}% deposit is required to confirm your slot; it is held for 10 minutes.</li>
                    )}
                    <li>Please give notice if you need to cancel or reschedule so the slot can be offered to someone else.</li>
                  </ul>
                </span>
              </label>

              <button onClick={handleConfirm} disabled={submitting || !phone || !agreed} className="btn btn-primary" style={{ width: "100%" }}>
                {submitting
                  ? "Booking…"
                  : salon.depositPercent > 0
                    ? `Hold this slot — ${salon.depositPercent}% deposit required`
                    : `Confirm — ${selectedService ? "₦" + Number(selectedService.priceNaira).toLocaleString() : ""}`}
              </button>
            </section>
          </div>
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

const hero: React.CSSProperties = {
  marginBottom: "var(--space-5)",
  padding: "var(--space-5) var(--space-4)",
  borderRadius: "var(--radius-md, 14px)",
  background: "linear-gradient(135deg, #171310 0%, #2a211a 100%)",
  boxShadow: "var(--shadow-card)",
};

const optional: React.CSSProperties = { fontWeight: 400, color: "var(--color-ink-faint)" };

const miniLabel: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--color-ink)",
  margin: "var(--space-3) 0 var(--space-1)",
};

const chipRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginBottom: "var(--space-2)" };

function chip(active: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-body)",
    fontSize: "0.8125rem",
    fontWeight: 600,
    padding: "0.45em 0.9em",
    borderRadius: 999,
    border: active ? "1.5px solid var(--color-gold)" : "1px solid var(--color-border)",
    background: active ? "rgba(var(--color-gold-rgb), 0.12)" : "var(--color-surface)",
    color: "var(--color-ink)",
    cursor: "pointer",
    transition: "all 0.25s ease",
  };
}

const consentBox: React.CSSProperties = {
  display: "flex",
  gap: "var(--space-2)",
  alignItems: "flex-start",
  fontSize: "0.8125rem",
  color: "var(--color-ink-soft)",
  padding: "var(--space-2) var(--space-3)",
  marginBottom: "var(--space-3)",
  borderRadius: "var(--radius-sm)",
  background: "rgba(var(--color-gold-rgb), 0.06)",
  border: "1px solid var(--color-border)",
  cursor: "pointer",
};
