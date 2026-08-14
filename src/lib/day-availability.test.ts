import test from "node:test";
import assert from "node:assert";

import {
  availableSlots,
  hoursForDate,
  slotStartsForDay,
  type DayHours,
} from "./day-availability";
import {
  instantToLagosClock,
  lagosToInstant,
  lagosWeekday,
  parseClock,
} from "./lagos-time";

const WED = "2026-09-02"; // Wednesday
const SAT = "2026-09-05";
const SUN = "2026-09-06";

/** Lagos wall-clock on the Wednesday fixture. */
function at(clock: string, date = WED) {
  return lagosToInstant(date, parseClock(clock));
}

function hours(weekday: number, opens: string, closes: string): DayHours {
  return { weekday, opensMin: parseClock(opens), closesMin: parseClock(closes) };
}

const WEEKDAY_HOURS = [hours(3, "10:00", "18:00")]; // Wednesday only

function clocks(slots: Date[]) {
  return slots.map((s) => instantToLagosClock(s));
}

test("weekday is derived from the date, not the server timezone", () => {
  assert.strictEqual(lagosWeekday(WED), 3);
  assert.strictEqual(lagosWeekday(SAT), 6);
  assert.strictEqual(lagosWeekday(SUN), 0);
});

test("Lagos wall clock maps to the correct UTC instant", () => {
  // 09:00 Lagos is 08:00 UTC. This is the assertion that would have caught the
  // production bug where slots shifted by an hour on a UTC server.
  assert.strictEqual(at("09:00").toISOString(), "2026-09-02T08:00:00.000Z");
  assert.strictEqual(instantToLagosClock(at("09:00")), "09:00");
});

test("a salon with no configured hours falls back to the default", () => {
  const day = hoursForDate(WED, []);
  assert.ok(day);
  assert.strictEqual(day.opensMin, 9 * 60);
  assert.strictEqual(day.closesMin, 19 * 60);
});

test("a salon with hours is closed on days it did not configure", () => {
  assert.strictEqual(hoursForDate(SAT, WEEKDAY_HOURS), null);
  assert.strictEqual(hoursForDate(SUN, WEEKDAY_HOURS), null);
  assert.ok(hoursForDate(WED, WEEKDAY_HOURS));
});

test("slots span the open window and finish before closing", () => {
  const starts = slotStartsForDay({ date: WED, hours: WEEKDAY_HOURS, durationMin: 60 });
  // 10:00-18:00, 60m service, 30m step -> last start is 17:00.
  assert.strictEqual(clocks(starts)[0], "10:00");
  assert.strictEqual(clocks(starts).at(-1), "17:00");
});

test("a service too long for the window yields nothing", () => {
  const starts = slotStartsForDay({ date: WED, hours: WEEKDAY_HOURS, durationMin: 600 });
  assert.deepStrictEqual(starts, []);
});

test("a closed day yields nothing", () => {
  assert.deepStrictEqual(
    slotStartsForDay({ date: SUN, hours: WEEKDAY_HOURS, durationMin: 60 }),
    []
  );
});

test("step size controls slot spacing", () => {
  const starts = slotStartsForDay({
    date: WED,
    hours: [hours(3, "10:00", "12:00")],
    durationMin: 60,
    stepMin: 15,
  });
  assert.deepStrictEqual(clocks(starts), ["10:00", "10:15", "10:30", "10:45", "11:00"]);
});

test("existing appointments remove exactly the overlapping starts", () => {
  const slots = availableSlots({
    date: WED,
    hours: [hours(3, "10:00", "14:00")],
    durationMin: 60,
    busy: [{ start: at("11:00"), end: at("12:00") }],
    now: at("00:00"),
  });
  // 10:00 ends at 11:00 — touching, so still bookable. 10:30 and 11:00 collide.
  assert.deepStrictEqual(clocks(slots), ["10:00", "12:00", "12:30", "13:00"]);
});

test("minimum notice removes slots that are too soon", () => {
  const slots = availableSlots({
    date: WED,
    hours: [hours(3, "10:00", "14:00")],
    durationMin: 60,
    busy: [],
    now: at("10:00"),
    minNoticeMin: 120,
  });
  assert.deepStrictEqual(clocks(slots), ["12:00", "12:30", "13:00"]);
});

test("slots earlier today are not offered", () => {
  const slots = availableSlots({
    date: WED,
    hours: [hours(3, "10:00", "14:00")],
    durationMin: 60,
    busy: [],
    now: at("12:10"),
  });
  // 12:00 has passed; 12:30 is the next offer.
  assert.deepStrictEqual(clocks(slots), ["12:30", "13:00"]);
});

test("a fully booked day offers nothing", () => {
  const slots = availableSlots({
    date: WED,
    hours: [hours(3, "10:00", "12:00")],
    durationMin: 60,
    busy: [{ start: at("10:00"), end: at("12:00") }],
    now: at("00:00"),
  });
  assert.deepStrictEqual(slots, []);
});

test("back-to-back bookings leave no phantom gap", () => {
  const slots = availableSlots({
    date: WED,
    hours: [hours(3, "10:00", "14:00")],
    durationMin: 60,
    busy: [
      { start: at("10:00"), end: at("11:00") },
      { start: at("11:00"), end: at("12:00") },
    ],
    now: at("00:00"),
  });
  assert.deepStrictEqual(clocks(slots), ["12:00", "12:30", "13:00"]);
});
