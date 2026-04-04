import { EmployeeData } from "@/lib/types";
import { getPermissibleLateMinutes } from "@/lib/unifiedCalculations";
import {
  getAdjPWorkMinutes,
  isAdjPFullDayPresent,
  isAdjPHalfDayPresent,
} from "@/lib/adjPresentMinutes";

// --------------------
// Utility helpers
// --------------------
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + (minutes || 0);
};

const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${emp.department ?? ""}`.toLowerCase();
  if (inStr.includes("c cash")) return false;
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  return true; // Default to staff
};

// --------------------
// Shared core logic
// --------------------
export function calculateTotalDeductionMinutes(
  employee: EmployeeData,
  options?: {
    includeBreaks?: boolean;       // true → include breakExcessMinutes if available
    breakExcessMinutes?: number;   // pass manually if you already calculated it
  }
) {
  const STANDARD_START_MINUTES = 8 * 60 + 30;     // 8:30 AM
  const EVENING_SHIFT_START_MINUTES = 13 * 60 + 15; // 1:15 PM
  const MORNING_EVENING_CUTOFF_MINUTES = 10 * 60; // 10 AM cutoff
  const permissibleLateMins = getPermissibleLateMinutes(employee.companyName);
  const STAFF_RELAXATION_MINUTES = 4 * 60;

  const isStaff = getIsStaff(employee);

  let lateMinsTotal = 0;
  let earlyDepartureTotalMinutes = 0;
  let lessThan4HrMins = 0;

  // ---------- Per-day evaluation ----------
  employee.days?.forEach((day) => {
    const status = (day.attendance.status || "").toUpperCase();
    const inTime = day.attendance.inTime;

    // ---- LATE ARRIVAL ----
    if (inTime && inTime !== "-") {
      const inMinutes = timeToMinutes(inTime);
      let dailyLateMins = 0;

      if (
        status === "P/A" ||
        status === "PA" ||
        ((status === "ADJ-P" || status === "ADJP") &&
          isAdjPHalfDayPresent(getAdjPWorkMinutes(day)))
      ) {
        if (inMinutes < MORNING_EVENING_CUTOFF_MINUTES) {
          if (inMinutes > STANDARD_START_MINUTES)
            dailyLateMins = inMinutes - STANDARD_START_MINUTES;
        } else if (inMinutes > EVENING_SHIFT_START_MINUTES) {
          dailyLateMins = inMinutes - EVENING_SHIFT_START_MINUTES;
        }
      } else if (status === "P") {
        if (inMinutes > STANDARD_START_MINUTES)
          dailyLateMins = inMinutes - STANDARD_START_MINUTES;
      } else if (
        isStaff &&
        (status === "ADJ-P" || status === "ADJP") &&
        isAdjPFullDayPresent(getAdjPWorkMinutes(day))
      ) {
        if (inMinutes > STANDARD_START_MINUTES)
          dailyLateMins = inMinutes - STANDARD_START_MINUTES;
      }

      if (dailyLateMins > permissibleLateMins)
        lateMinsTotal += dailyLateMins;
    }

    const workMins = getAdjPWorkMinutes(day);

    // ---- EARLY DEPARTURE ----
    const earlyDepMins = Number(day.attendance.earlyDep) || 0;

    // 1. Skip early departure for explicit P/A and adj-P/A statuses
    if (status === "P/A" || status === "PA" ||
      status === "ADJ-P/A" || status === "ADJP/A" || status === "ADJ-PA") {
      // Skip
    }
    // 2. Handle adj-P
    else if (status === "ADJ-P" || status === "ADJP") {
      if (isAdjPFullDayPresent(workMins) && earlyDepMins > 0) {
        earlyDepartureTotalMinutes += earlyDepMins;
      }
    }
    // 3. Count for others
    else {
      if (earlyDepMins > 0) earlyDepartureTotalMinutes += earlyDepMins;
    }

    // ---- LESS THAN 4 HOURS (P/A) ----
    // ❌ REMOVED: Logic removed to prevent double deduction with Early Departure
    // if ((status === "P/A" || status === "PA") && workMins < 240)
    //   lessThan4HrMins += 240 - workMins;
  });

  // ---------- Combine ----------
  const breakExcessMinutes =
    options?.includeBreaks && options.breakExcessMinutes
      ? options.breakExcessMinutes
      : 0;

  let total =
    lateMinsTotal + earlyDepartureTotalMinutes + lessThan4HrMins + breakExcessMinutes;

  if (isStaff)
    total = Math.max(0, total - STAFF_RELAXATION_MINUTES);

  return {
    totalCombinedMinutes: Math.round(total),
    lateMinsTotal: Math.round(lateMinsTotal),
    earlyDepartureTotalMinutes: Math.round(earlyDepartureTotalMinutes),
    lessThan4HrMins: Math.round(lessThan4HrMins),
    breakExcessMinutes: Math.round(breakExcessMinutes),
    isStaff,
  };
}
