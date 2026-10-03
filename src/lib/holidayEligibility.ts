import { DayAttendance } from "./types";

const normalize = (status?: string | null): string =>
  (status || "").toUpperCase().trim();

const isAbsentOrNA = (status: string): boolean =>
  status === "A" || status === "NA" || status === "ABSENT";

// Non-working days that bridge a holiday block. A holiday next to a week off
// (e.g. A, H, WO, A) is still sandwiched between absences.
const isNonWorkingDay = (status: string): boolean =>
  status === "H" ||
  status === "ADJ-M/WO-I" ||
  status === "ADJ-M" ||
  status === "WO-I" ||
  status === "WO";

/**
 * Sandwich Rule: a holiday (H) is paid only if the employee was not absent on
 * BOTH the nearest working day before and the nearest working day after it.
 * Example: H on 4th, A on 3rd and 5th → the 4th is NOT paid.
 * Returns the number of paid (eligible) holidays.
 */
export function countEligibleHolidays(
  days: DayAttendance[] = [],
  empName?: string
): number {
  let eligible = 0;
  let i = 0;

  while (i < days.length) {
    if (!isNonWorkingDay(normalize(days[i].attendance.status))) {
      i++;
      continue;
    }

    const blockStart = i;
    let blockEnd = i;
    while (
      blockEnd + 1 < days.length &&
      isNonWorkingDay(normalize(days[blockEnd + 1].attendance.status))
    ) {
      blockEnd++;
    }

    const prevStatus =
      blockStart > 0 ? normalize(days[blockStart - 1].attendance.status) : null;
    const nextStatus =
      blockEnd + 1 < days.length
        ? normalize(days[blockEnd + 1].attendance.status)
        : null;

    const isSandwiched =
      prevStatus !== null &&
      nextStatus !== null &&
      isAbsentOrNA(prevStatus) &&
      isAbsentOrNA(nextStatus);

    let blockHolidays = 0;
    for (let j = blockStart; j <= blockEnd; j++) {
      if (normalize(days[j].attendance.status) === "H") blockHolidays++;
    }

    if (isSandwiched) {
      if (blockHolidays > 0 && empName) {
        console.log(
          `🥪 ${empName} - Days ${days[blockStart].date}-${days[blockEnd].date} sandwiched between ${prevStatus}(Day ${days[blockStart - 1].date}) and ${nextStatus}(Day ${days[blockEnd + 1].date}) - ${blockHolidays} holiday(s) NOT paid`
        );
      }
    } else {
      eligible += blockHolidays;
    }

    i = blockEnd + 1;
  }

  return eligible;
}
