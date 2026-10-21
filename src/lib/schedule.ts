/** Pure scheduling logic: no database, no time zones (dates are plain YYYY-MM-DD strings, calculated in UTC to avoid DST drift). */
export type LessonType = "teaching" | "midtest" | "final" | "revision";
export interface SlotPlan { slot: number; unitWeek: number; type: LessonType }
export interface DatedSlot extends SlotPlan { date: string | null; combinedWithSlot: number | null; beyondEnd: boolean }

export const TEACHING_UNITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
export const MID_UNIT = 13, FINAL_UNIT = 25, REVISION_UNIT = 26;

const toUtc = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const isoOf = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => { const d = toUtc(iso); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
export const weekdayOf = (iso: string) => toUtc(iso).getUTCDay();
export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUtc(s).getTime()) && isoOf(toUtc(s)) === s;

export interface PlanOptions { midtestWeek: number; finalWeek: number; revisionWeek: number }
export const DEFAULT_PLAN: PlanOptions = { midtestWeek: 13, finalWeek: 25, revisionWeek: 26 };

/** Maps the 26 calendar slots to the 26 curriculum units. Assessment units sit in the chosen slots; teaching units fill the rest in order. */
export function planSlots(o: PlanOptions = DEFAULT_PLAN): { slots: SlotPlan[]; warnings: string[]; errors: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const picks = [o.midtestWeek, o.finalWeek, o.revisionWeek];
  if (picks.some((w) => !Number.isInteger(w) || w < 1 || w > 26)) errors.push("Assessment weeks must be whole numbers from 1 to 26.");
  if (new Set(picks).size !== 3) errors.push("The test, examination and revision must fall in three different weeks.");
  if (o.midtestWeek >= o.finalWeek) errors.push("The mid-session test must come before the final examination.");
  if (errors.length) return { slots: [], warnings, errors };
  if (o.midtestWeek < 13) warnings.push(`The mid-session test is in week ${o.midtestWeek}, before lesson 12 is taught; it will cover lessons not yet delivered.`);
  if (o.revisionWeek < o.finalWeek) warnings.push("Revision is scheduled before the final examination (a supported option).");
  const remaining = [...TEACHING_UNITS];
  const slots: SlotPlan[] = [];
  for (let s = 1; s <= 26; s++) {
    if (s === o.midtestWeek) slots.push({ slot: s, unitWeek: MID_UNIT, type: "midtest" });
    else if (s === o.finalWeek) slots.push({ slot: s, unitWeek: FINAL_UNIT, type: "final" });
    else if (s === o.revisionWeek) slots.push({ slot: s, unitWeek: REVISION_UNIT, type: "revision" });
    else slots.push({ slot: s, unitWeek: remaining.shift()!, type: "teaching" });
  }
  return { slots, warnings, errors };
}

/** Teaching dates between start and end (inclusive) on the chosen weekday, minus excluded dates. */
export function eligibleDates(start: string, end: string, weekday: number, exclude: string[] = []): string[] {
  const ex = new Set(exclude);
  const out: string[] = [];
  let d = start;
  while (weekdayOf(d) !== weekday) d = addDays(d, 1);
  for (; d <= end; d = addDays(d, 7)) if (!ex.has(d)) out.push(d);
  return out;
}

export type ShortfallPolicy = "extend" | "combine" | "unscheduled";
export interface ProposalInput extends PlanOptions {
  start: string; end: string; weekday: number; exclude?: string[]; shortfallPolicy?: ShortfallPolicy;
}
export interface Proposal {
  slots: DatedSlot[]; eligibleCount: number; shortfall: number; spareDates: string[]; warnings: string[]; errors: string[]; endsOn: string | null;
}

/**
 * Proposes dates for all 26 slots. NEVER drops a lesson: when the calendar is short the policy decides whether to extend past the end date,
 * combine two teaching lessons on one date, or leave the tail unscheduled for the administrator to place.
 */
export function proposeSchedule(inp: ProposalInput): Proposal {
  const plan = planSlots(inp);
  const empty: Proposal = { slots: [], eligibleCount: 0, shortfall: 0, spareDates: [], warnings: plan.warnings, errors: plan.errors, endsOn: null };
  if (plan.errors.length) return empty;
  if (!isIsoDate(inp.start) || !isIsoDate(inp.end) || inp.end < inp.start) return { ...empty, errors: ["Enter a valid start date and an end date on or after it."] };
  const exclude = (inp.exclude ?? []).filter(isIsoDate);
  const dates = eligibleDates(inp.start, inp.end, inp.weekday, exclude);
  const warnings = [...plan.warnings];
  const slots: DatedSlot[] = plan.slots.map((s) => ({ ...s, date: null, combinedWithSlot: null, beyondEnd: false }));
  let spare: string[] = [];
  const shortfall = Math.max(0, 26 - dates.length);
  if (shortfall === 0) {
    slots.forEach((s, i) => (s.date = dates[i]));
    spare = dates.slice(26);
    if (spare.length) warnings.push(`${spare.length} spare teaching date(s) remain after the 26 weeks. You may use them for extra revision.`);
  } else {
    warnings.push(`Only ${dates.length} teaching dates are available between ${inp.start} and ${inp.end}; the programme needs 26. ${shortfall} lesson(s) need a decision.`);
    const policy = inp.shortfallPolicy ?? "extend";
    if (policy === "extend") {
      let last = dates.length ? dates[dates.length - 1] : addDays(inp.start, -7);
      slots.forEach((s, i) => {
        if (i < dates.length) s.date = dates[i];
        else { do { last = addDays(last, 7); } while (exclude.includes(last)); s.date = last; s.beyondEnd = true; }
      });
      warnings.push(`The programme was extended past the end date to ${slots[25].date} so no lesson is lost.`);
    } else if (policy === "combine") {
      // Share a date between two adjacent TEACHING slots, working from the end of the second half backwards.
      const combine = new Set<number>(); // slot numbers that share the previous slot's date
      for (let s = 24; s >= 2 && combine.size < shortfall; s--) {
        const a = slots[s - 1], b = slots[s - 2];
        if (a.type === "teaching" && b.type === "teaching" && !combine.has(s - 1) && !combine.has(s)) combine.add(s);
      }
      if (combine.size < shortfall) warnings.push("Not enough adjacent teaching lessons could be combined; some lessons remain unscheduled.");
      let di = 0;
      slots.forEach((s, i) => {
        if (combine.has(s.slot)) { s.date = slots[i - 1].date; s.combinedWithSlot = slots[i - 1].slot; }
        else s.date = di < dates.length ? dates[di++] : null;
      });
      if (slots.some((s) => !s.date)) warnings.push("Some lessons have no date yet; set them manually before activating.");
    } else {
      slots.forEach((s, i) => (s.date = i < dates.length ? dates[i] : null));
      warnings.push("The remaining lessons are unscheduled; set their dates before activating the session.");
    }
  }
  const dated = slots.filter((s) => s.date).map((s) => s.date!);
  return { slots, eligibleCount: dates.length, shortfall, spareDates: spare, warnings, errors: [], endsOn: dated.length ? dated.reduce((a, b) => (a > b ? a : b)) : null };
}

/** Re-dates the not-yet-delivered tail after a change: keeps delivered slots, then walks forward weekly from the new anchor, skipping excluded dates. */
export function rescheduleFrom(slots: { slot: number; date: string | null; delivered: boolean }[], fromSlot: number, anchorDate: string, exclude: string[] = []): { slot: number; date: string }[] {
  const ex = new Set(exclude);
  const out: { slot: number; date: string }[] = [];
  let d = anchorDate;
  for (const s of [...slots].sort((a, b) => a.slot - b.slot)) {
    if (s.slot < fromSlot || s.delivered) continue;
    while (ex.has(d)) d = addDays(d, 7);
    out.push({ slot: s.slot, date: d });
    d = addDays(d, 7);
  }
  return out;
}
