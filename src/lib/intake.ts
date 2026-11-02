export const DRAPING_OPTIONS = [
  { value: "standard", label: "Standard", hint: "Most areas covered" },
  { value: "minimal", label: "Minimal", hint: "More exposure for treatment" },
  { value: "maximum", label: "Maximum coverage", hint: "Fully covered" },
] as const;

export const SKIN_TYPES = ["Normal", "Dry", "Oily", "Combination", "Sensitive", "Not sure"] as const;

export type Intake = {
  areasOfFocus?: string;
  draping?: (typeof DRAPING_OPTIONS)[number]["value"];
  skinType?: (typeof SKIN_TYPES)[number];
  notes?: string;
  consentedAt: string;
};

/** Whitelists and trims untrusted public input; returns null if nothing was provided. */
export function parseIntake(raw: unknown): Intake | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

  const draping = DRAPING_OPTIONS.find((o) => o.value === r.draping)?.value;
  const skinType = SKIN_TYPES.find((s) => s === r.skinType);
  const areasOfFocus = text(r.areasOfFocus, 500);
  const notes = text(r.notes, 1000);

  if (!draping && !skinType && !areasOfFocus && !notes) return null;
  return { areasOfFocus, draping, skinType, notes, consentedAt: new Date().toISOString() };
}
