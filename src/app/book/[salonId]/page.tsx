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

  if (loading) return <main style={{ padding: "2.5rem" }}>Loading...</main>;
  if (!salon) return <main style={{ padding: "2.5rem" }}>{error ?? "Salon not found"}</main>;

  if (confirmed) {
    return (
      <main style={{ padding: "2.5rem", maxWidth: 420 }}>
        <h1>Booked!</h1>
        <p>
          You're booked at {salon.name} on {new Date(selectedSlot!).toLocaleString()}. See you then.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2.5rem", maxWidth: 420 }}>
      <h1>{salon.name}</h1>
      {salon.city && <p style={{ color: "#666" }}>{salon.city}</p>}

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <label>
        Service
        <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} style={{ display: "block", width: "100%", padding: 8, margin: "6px 0" }}>
          {salon.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — ₦{Number(s.priceNaira).toLocaleString()} ({s.durationMin}min)
            </option>
          ))}
        </select>
      </label>

      <label>
        Stylist
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={{ display: "block", width: "100%", padding: 8, margin: "6px 0" }}>
          {salon.staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ display: "block", width: "100%", padding: 8, margin: "6px 0" }} />
      </label>

      <p style={{ marginTop: 12 }}>Available times</p>
      {slotsLoading ? (
        <p>Checking availability...</p>
      ) : slots.length === 0 ? (
        <p>No open slots that day — try another date.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {slots.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSlot(s)}
              style={{
                padding: "6px 10px",
                border: selectedSlot === s ? "2px solid #333" : "1px solid #ccc",
                background: selectedSlot === s ? "#eee" : "white",
              }}
            >
              {new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </button>
          ))}
        </div>
      )}

      {selectedSlot && (
        <div style={{ marginTop: 16 }}>
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ display: "block", width: "100%", padding: 8, margin: "6px 0" }} />
          </label>
          <label>
            Your phone (WhatsApp number)
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="2348012345678"
              required
              style={{ display: "block", width: "100%", padding: 8, margin: "6px 0" }}
            />
          </label>
          <button onClick={handleConfirm} disabled={submitting || !phone}>
            {submitting ? "Booking..." : "Confirm booking"}
          </button>
        </div>
      )}
    </main>
  );
}
