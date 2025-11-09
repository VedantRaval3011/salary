import { EmployeeData } from "./types";

// Helper to convert time string to minutes
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + (minutes || 0);
};

// Helper to parse OT/Work minutes from various formats
const parseMinutes = (val?: string | number | null): number => {
  if (!val) return 0;
  const str = String(val).trim();

  if (str.includes(":")) {
    const [h, m] = str.split(":").map((x) => parseInt(x) || 0);
    return h * 60 + m;
  }

  const decimalHours = parseFloat(str);
  if (!isNaN(decimalHours)) {
    return Math.round(decimalHours * 60);
  }

  return 0;
};

// Helper for custom timing OT
const calculateCustomTimingOT = (
  outTime: string,
  expectedEndMinutes: number
): number => {
  if (!outTime || outTime === "-") return 0;
  const outMinutes = timeToMinutes(outTime);
  const otMinutes =
    outMinutes > expectedEndMinutes ? outMinutes - expectedEndMinutes : 0;
  return otMinutes < 5 ? 0 : otMinutes;
};

/**
 * A shared function to calculate all present day stats for a single employee.
 * This can be used by any component, removing duplicate logic.
 */
export function calculateEmployeeStats(
  employee: EmployeeData,
  baseHolidaysCount: number,
  selectedHolidaysCount: number,
  // All lookup functions are passed in as arguments
  getPL: (emp: Pick<EmployeeData, "empCode" | "empName">) => number,
  getGrantForEmployee: (
    emp: Pick<EmployeeData, "empCode" | "empName">
  ) => any | undefined,
  getFullNightOTForEmployee: (
    emp: Pick<EmployeeData, "empCode" | "empName">
  ) => number,
  getCustomTimingForEmployee: (
    emp: Pick<EmployeeData, "empCode" | "empName">
  ) => {
    customTime: string;
    expectedEndMinutes: number;
    expectedStartMinutes: number;
  } | null,
  isMaintenanceEmployee: (
    emp: Pick<EmployeeData, "empCode" | "empName">
  ) => boolean
) {
  // --- 1. Calculate PAA (Present After Adjustment) & Week Offs ---
  let paCount = 0;
  let fullPresentDays = 0;
  let adjPresentDays = 0;
  let weekOffDays = 0;

  employee.days?.forEach((day) => {
    const status = (day.attendance.status || "").toUpperCase();
    if (status === "P") fullPresentDays++;
    else if (status === "P/A" || status === "PA") paCount++;
    else if (status === "ADJ-P") adjPresentDays++;
    else if (status === "WO") weekOffDays++;
  });

  const paAdjustment = paCount * 0.5;
  const PAA = fullPresentDays + adjPresentDays + paAdjustment;
  const H_base = selectedHolidaysCount || baseHolidaysCount || 0;
  
  // Total = PAA + Holidays + Week Offs
  const Total = PAA + H_base + weekOffDays;

  // --- 2. Calculate Late Hours ---
  const customTiming = getCustomTimingForEmployee(employee);
  let lateMinsTotal = 0;

  const STANDARD_START_MINUTES = 8 * 60 + 30; // 8:30 AM
  const EVENING_SHIFT_START_MINUTES = 12 * 60 + 45; // 12:45 PM
  const MORNING_EVENING_CUTOFF_MINUTES = 10 * 60; // 10:00 AM
  const PERMISSIBLE_LATE_MINS = 5;

  const employeeNormalStartMinutes =
    customTiming?.expectedStartMinutes ?? STANDARD_START_MINUTES;

  employee.days?.forEach((day) => {
    const status = (day.attendance.status || "").toUpperCase();
    const inTime = day.attendance.inTime;
    if (!inTime || inTime === "-") return;
    const inMinutes = timeToMinutes(inTime);
    let dailyLateMins = 0;

    if (status === "P/A" || status === "PA") {
      if (inMinutes < MORNING_EVENING_CUTOFF_MINUTES) {
        if (inMinutes > employeeNormalStartMinutes) {
          dailyLateMins = inMinutes - employeeNormalStartMinutes;
        }
      } else {
        if (inMinutes > EVENING_SHIFT_START_MINUTES) {
          dailyLateMins = inMinutes - EVENING_SHIFT_START_MINUTES;
        }
      }
    } else if (status === "P" || status === "ADJ-P") {
      if (inMinutes > employeeNormalStartMinutes) {
        dailyLateMins = inMinutes - employeeNormalStartMinutes;
      }
    }

    if (dailyLateMins > PERMISSIBLE_LATE_MINS) {
      lateMinsTotal += dailyLateMins;
    }
  });

  const Late_hours = Number((lateMinsTotal / 60).toFixed(2));

  // --- 3. Calculate OT Hours ---
  let totalOTMinutes = 0;
  let customTimingOTMinutes = 0;
  const grant = getGrantForEmployee(employee);

  if (grant) {
    const fromD = Number(grant.fromDate) || 1;
    const toD = Number(grant.toDate) || 31;

    employee.days?.forEach((day) => {
      const dateNum = Number(day.date) || 0;
      if (dateNum >= fromD && dateNum <= toD) {
        let dayOTMinutes = 0;
        if (customTiming) {
          dayOTMinutes = calculateCustomTimingOT(
            day.attendance.outTime,
            customTiming.expectedEndMinutes
          );
          if (dayOTMinutes > 0) customTimingOTMinutes += dayOTMinutes;
        } else {
          const otField =
            (day.attendance as any).otHours ??
            (day.attendance as any).otHrs ??
            (day.attendance as any).ot ??
            (day.attendance as any).workHrs ??
            (day.attendance as any).workHours ??
            null;
          dayOTMinutes = parseMinutes(otField);
        }
        totalOTMinutes += Math.min(dayOTMinutes, 540); // Cap at 9 hours
      }
    });
  } else {
    employee.days?.forEach((day) => {
      const dayName = (day.day || "").toLowerCase();
      const status = (day.attendance.status || "").toUpperCase();

      if (dayName === "sa" && status !== "ADJ-P") {
        let dayOTMinutes = 0;
        if (customTiming) {
          dayOTMinutes = calculateCustomTimingOT(
            day.attendance.outTime,
            customTiming.expectedEndMinutes
          );
          if (dayOTMinutes > 0) customTimingOTMinutes += dayOTMinutes;
        } else {
          const otField =
            (day.attendance as any).otHours ??
            (day.attendance as any).otHrs ??
            (day.attendance as any).ot ??
            (day.attendance as any).workHrs ??
            (day.attendance as any).workHours ??
            null;
          dayOTMinutes = parseMinutes(otField);
        }
        totalOTMinutes += Math.min(dayOTMinutes, 540); // Cap at 9 hours
      }
    });
  }

  // Add Full Night Stay OT
  const fullNightOTHours = getFullNightOTForEmployee(employee);
  if (fullNightOTHours > 0) {
    totalOTMinutes += fullNightOTHours * 60;
  }

  // Apply 5% OT Deduction for Maintenance Employees
  let wasOTDeducted = false;
  if (isMaintenanceEmployee(employee)) {
    totalOTMinutes = totalOTMinutes * 0.95;
    wasOTDeducted = true;
  }

  const OT_hours = Number((totalOTMinutes / 60).toFixed(2));
  const customTimingOTHours = Number((customTimingOTMinutes / 60).toFixed(2));

  // --- 4. Calculate Final Totals ---
  let AdditionalOT = 0;
  if (totalOTMinutes < lateMinsTotal) {
    const diff = Late_hours - OT_hours;
    AdditionalOT = 0.5 * Math.floor(diff / 4);
  }

  const ATotal = Math.max(Total - AdditionalOT, 0);
  const pl = getPL(employee) || 0;
  const GrandTotal = Math.max(ATotal + pl, 0);

  // --- 5. Return all calculated values ---
  return {
    PD_excel: employee.present || 0,
    PAA: Number(PAA.toFixed(1)),
    H_base,
    weekOffDays,
    Total: Number(Total.toFixed(1)),
    Late_hours,
    OT_hours,
    AdditionalOT: Number(AdditionalOT.toFixed(1)),
    ATotal: Number(ATotal.toFixed(1)),
    PL_days: pl,
    GrandTotal: Number(GrandTotal.toFixed(1)),
    paCount,
    adjPresentDays,
    fullNightOTHours,
    customTimingOTHours,
    wasOTDeducted,
  };
}