import type { DayAttendance } from "./types";

/** Lower bound (~7h 35m): at or above this counts as full-day presence on ADJ-P. */
export const ADJ_P_FULL_DAY_MIN_MINS = 8 * 60 - 25;

const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + (minutes || 0);
};

/** Work minutes for a day: workHrs / decimal hours / in–out span. */
export function getAdjPWorkMinutes(day: DayAttendance): number {
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

/** True when ADJ-P should count as a full present day (≈8h+). */
export function isAdjPFullDayPresent(workMins: number): boolean {
  return workMins >= ADJ_P_FULL_DAY_MIN_MINS;
}

/** True when ADJ-P should count as half-day presence (below full-day threshold). */
export function isAdjPHalfDayPresent(workMins: number): boolean {
  return workMins > 0 && workMins < ADJ_P_FULL_DAY_MIN_MINS;
}
