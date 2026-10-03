/** Minimum minutes after shift end before late OT counts. */
export const LATE_OT_MIN_MINUTES = 5;

/**
 * Minimum minutes before shift start before early OT counts.
 * Coming 10–30 min early is normal and not paid as OT (HR does not count it);
 * coming in hours early (e.g. 06:00 for a 09:00 shift) is.
 */
export const EARLY_OT_MIN_MINUTES = 60;

const toMinutes = (t?: string): number | null => {
  if (!t || t === "-") return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return null;
  return h * 60 + (m || 0);
};

export interface CustomTimingOT {
  /** Worked before shift start (in minutes). */
  earlyMinutes: number;
  /** Worked after shift end (in minutes). */
  lateMinutes: number;
  totalMinutes: number;
}

/**
 * OT for an employee with custom timing (e.g. "9:00 TO 6:00"):
 * early OT (came before shift start) + late OT (left after shift end).
 */
export function getCustomTimingOT(
  inTime: string | undefined,
  outTime: string | undefined,
  expectedStartMinutes: number | undefined,
  expectedEndMinutes: number
): CustomTimingOT {
  const inMin = toMinutes(inTime);
  const outMin = toMinutes(outTime);

  let lateMinutes = 0;
  if (outMin !== null && outMin - expectedEndMinutes >= LATE_OT_MIN_MINUTES) {
    lateMinutes = outMin - expectedEndMinutes;
  }

  let earlyMinutes = 0;
  if (
    inMin !== null &&
    outMin !== null &&
    expectedStartMinutes !== undefined &&
    expectedStartMinutes - inMin >= EARLY_OT_MIN_MINUTES
  ) {
    // Early OT can't exceed the time actually worked before leaving.
    earlyMinutes = Math.min(expectedStartMinutes, outMin) - inMin;
    if (earlyMinutes < 0) earlyMinutes = 0;
  }

  return { earlyMinutes, lateMinutes, totalMinutes: earlyMinutes + lateMinutes };
}

/** Total custom timing OT minutes (early + late). */
export function getCustomTimingOTMinutes(
  inTime: string | undefined,
  outTime: string | undefined,
  expectedStartMinutes: number | undefined,
  expectedEndMinutes: number
): number {
  return getCustomTimingOT(inTime, outTime, expectedStartMinutes, expectedEndMinutes)
    .totalMinutes;
}
