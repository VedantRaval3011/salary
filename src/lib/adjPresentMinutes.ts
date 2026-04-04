import type { DayAttendance } from "./types";

/** Full present on adjustment days only when worked ~8h+ (25 min buffer). */
export const ADJUSTMENT_DAY_FULL_PRESENT_MIN_MINS = 8 * 60 - 25;

const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + (minutes || 0);
};

/**
 * Work minutes for ADJ-P / ADJ-M / ADJ-M/WO-I: workHrs, decimal hours, or in–out span.
 */
export function getAdjustmentDayWorkMinutes(day: DayAttendance): number {
  const workHours = day.attendance.workHrs || 0;
  let workMins = 0;
  if (typeof workHours === "string" && workHours.includes(":")) {
    const [h, m] = workHours.split(":").map(Number);
    workMins = h * 60 + (m || 0);
  } else if (!isNaN(Number(workHours))) {
    workMins = Number(workHours) * 60;
  }
  if (
    workMins === 0 &&
    day.attendance.inTime &&
    day.attendance.outTime &&
    day.attendance.inTime !== "-" &&
    day.attendance.outTime !== "-"
  ) {
    const inM = timeToMinutes(day.attendance.inTime);
    const outM = timeToMinutes(day.attendance.outTime);
    if (outM > inM) workMins = outM - inM;
  }
  return workMins;
}

export function isAdjustmentDayFullPresent(workMins: number): boolean {
  return workMins >= ADJUSTMENT_DAY_FULL_PRESENT_MIN_MINS;
}

export function isAdjustmentDayPartialPresent(workMins: number): boolean {
  return workMins > 0 && workMins < ADJUSTMENT_DAY_FULL_PRESENT_MIN_MINS;
}
