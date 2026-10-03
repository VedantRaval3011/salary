import { DayAttendance, EmployeeData } from "./types";
import { getAdjustmentDayWorkMinutes } from "./adjPresentMinutes";

const normalize = (status?: string | null): string =>
  (status || "").toUpperCase().trim();

const ADJ_WORKING_STATUSES = ["ADJ-P", "ADJP", "ADJ-P/A", "ADJP/A", "ADJ-PA"];

// Absent, or an adjusted working day (week off swapped to working) with no work done.
const isAbsentDay = (day: DayAttendance): boolean => {
  const status = normalize(day.attendance.status);
  if (status === "A" || status === "NA" || status === "ABSENT") return true;
  return (
    ADJ_WORKING_STATUSES.includes(status) &&
    getAdjustmentDayWorkMinutes(day) === 0
  );
};

// Non-working days that bridge a holiday block. A holiday next to a week off
// (e.g. A, H, WO, A) is still sandwiched between absences.
const isNonWorkingDay = (status: string): boolean =>
  status === "H" ||
  status === "ADJ-M/WO-I" ||
  status === "ADJ-M" ||
  status === "M/WO-I" ||
  status === "WO-I" ||
  status === "WO";

const hasWorked = (day: DayAttendance): boolean => {
  const status = normalize(day.attendance.status);
  if (["P", "P/A", "PA", "OD"].includes(status)) return true;
  return status.startsWith("ADJ") && getAdjustmentDayWorkMinutes(day) > 0;
};

// A date counts as a company closure when at most this share of employees worked.
const CLOSURE_MAX_WORKED_RATIO = 0.02;

const closureCache = new WeakMap<EmployeeData[], Set<number>>();

/**
 * Dates on which (almost) nobody worked, e.g. the factory was shut. On such a
 * day everyone shows "A", but it is not the employee's own absence, so the
 * sandwich rule looks past it to the nearest real working day.
 */
export function getCompanyClosureDates(
  employees: EmployeeData[] = []
): Set<number> {
  const cached = closureCache.get(employees);
  if (cached) return cached;

  const total = new Map<number, number>();
  const worked = new Map<number, number>();
  for (const emp of employees) {
    for (const day of emp.days || []) {
      total.set(day.date, (total.get(day.date) || 0) + 1);
      if (hasWorked(day)) worked.set(day.date, (worked.get(day.date) || 0) + 1);
    }
  }

  const closures = new Set<number>();
  // Need a meaningful sample before calling a date a company-wide closure.
  if (employees.length >= 10) {
    total.forEach((count, date) => {
      if ((worked.get(date) || 0) / count <= CLOSURE_MAX_WORKED_RATIO) {
        closures.add(date);
      }
    });
  }

  closureCache.set(employees, closures);
  return closures;
}

/**
 * Sandwich Rule: a holiday (H) is NOT paid when the employee was absent on both
 * the nearest working day before and the nearest working day after it.
 * Week offs and company closure days are skipped when finding those days.
 * Example: H on 4th, A on 3rd and 5th → the 4th is NOT paid.
 * Holidays before the employee's joining day (DOJ in this month) are never paid.
 * Returns the number of paid (eligible) holidays.
 */
export function countEligibleHolidays(
  days: DayAttendance[] = [],
  closureDates: Set<number> = new Set(),
  empName?: string,
  joinDay?: number | null
): number {
  if (joinDay && joinDay > 1) {
    days = days.filter((d) => d.date >= joinDay);
  }
  const bridges = (day: DayAttendance) =>
    isNonWorkingDay(normalize(day.attendance.status)) ||
    closureDates.has(day.date);

  let eligible = 0;
  let i = 0;

  while (i < days.length) {
    if (!bridges(days[i])) {
      i++;
      continue;
    }

    const blockStart = i;
    let blockEnd = i;
    while (blockEnd + 1 < days.length && bridges(days[blockEnd + 1])) {
      blockEnd++;
    }

    const prevDay = blockStart > 0 ? days[blockStart - 1] : null;
    const nextDay = blockEnd + 1 < days.length ? days[blockEnd + 1] : null;

    const isSandwiched =
      prevDay !== null &&
      nextDay !== null &&
      isAbsentDay(prevDay) &&
      isAbsentDay(nextDay);

    let blockHolidays = 0;
    for (let j = blockStart; j <= blockEnd; j++) {
      if (normalize(days[j].attendance.status) === "H") blockHolidays++;
    }

    if (isSandwiched) {
      if (blockHolidays > 0 && empName) {
        console.log(
          `🥪 ${empName} - Days ${days[blockStart].date}-${days[blockEnd].date} sandwiched between ${normalize(prevDay.attendance.status)}(Day ${prevDay.date}) and ${normalize(nextDay.attendance.status)}(Day ${nextDay.date}) - ${blockHolidays} holiday(s) NOT paid`
        );
      }
    } else {
      eligible += blockHolidays;
    }

    i = blockEnd + 1;
  }

  return eligible;
}
