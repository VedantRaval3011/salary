// lib/unifiedCalculations.ts
// Centralized calculation logic to ensure consistency across components
// Import this in both LateComparison and EarlyDepartureStatsGrid

import { EmployeeData } from "@/lib/types";

// ===== UTILITY FUNCTIONS =====

export const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + (minutes || 0);
};

export const minutesToHHMM = (totalMinutes: number): string => {
  if (isNaN(totalMinutes) || totalMinutes <= 0) return "0:00";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

export const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${emp.department ?? ""}`.toLowerCase();
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  return true; // Default to staff
};

// ===== CONSTANTS =====

const STANDARD_START_MINUTES = 8 * 60 + 30; // 8:30 AM
const EVENING_SHIFT_START_MINUTES = 13 * 60 + 15; // 1:15 PM
const MORNING_EVENING_CUTOFF_MINUTES = 10 * 60; // 10:00 AM
const PERMISSIBLE_LATE_MINS = 5;
const STAFF_RELAXATION_MINUTES = 4 * 60; // 4 hours

// ===== CORE CALCULATION FUNCTIONS =====

/**
 * Calculate late arrival minutes for an employee
 */
export const calculateLateMinutes = (
  employee: EmployeeData,
  customStartMinutes?: number
): number => {
  const isStaff = getIsStaff(employee);
  const employeeNormalStartMinutes = customStartMinutes ?? STANDARD_START_MINUTES;
  let lateMinsTotal = 0;

  employee.days?.forEach((day) => {
    const status = (day.attendance.status || "").toUpperCase();
    const inTime = day.attendance.inTime;

    if (inTime && inTime !== "-") {
      const inMinutes = timeToMinutes(inTime);
      let dailyLateMins = 0;

      if (status === "P/A" || status === "PA") {
        // Morning shift
        if (inMinutes < MORNING_EVENING_CUTOFF_MINUTES) {
          if (inMinutes > employeeNormalStartMinutes) {
            dailyLateMins = inMinutes - employeeNormalStartMinutes;
          }
        } 
        // Evening shift
        else {
          if (inMinutes > EVENING_SHIFT_START_MINUTES) {
            dailyLateMins = inMinutes - EVENING_SHIFT_START_MINUTES;
          }
        }
      } else if (status === "P") {
        if (inMinutes > employeeNormalStartMinutes) {
          dailyLateMins = inMinutes - employeeNormalStartMinutes;
        }
      } else if (isStaff && status === "ADJ-P") {
        if (inMinutes > employeeNormalStartMinutes) {
          dailyLateMins = inMinutes - employeeNormalStartMinutes;
        }
      }

      // Only count if exceeds grace period
      if (dailyLateMins > PERMISSIBLE_LATE_MINS) {
        lateMinsTotal += dailyLateMins;
      }
    }
  });

  return Math.round(lateMinsTotal);
};

/**
 * Calculate early departure minutes for an employee
 */
export const calculateEarlyDepartureMinutes = (employee: EmployeeData): number => {
  let earlyDepartureTotalMinutes = 0;

  employee.days?.forEach((day) => {
    const earlyDepMins = Number(day.attendance.earlyDep) || 0;
    if (earlyDepMins > 0) {
      earlyDepartureTotalMinutes += earlyDepMins;
    }
  });

  return Math.round(earlyDepartureTotalMinutes);
};

/**
 * Calculate less than 4 hours on P/A days
 */
export const calculateLessThan4HoursMinutes = (employee: EmployeeData): number => {
  let lessThan4HrMins = 0;

  employee.days?.forEach((day) => {
    const status = (day.attendance.status || "").toUpperCase();
    const workHours = day.attendance.workHrs || 0;

    // Convert work hours to minutes
    let workMins = 0;
    if (typeof workHours === "string" && workHours.includes(":")) {
      const [h, m] = workHours.split(":").map(Number);
      workMins = h * 60 + (m || 0);
    } else if (!isNaN(Number(workHours))) {
      workMins = Number(workHours) * 60;
    }

    // If P/A and less than 4 hours (240 mins)
    if ((status === "P/A" || status === "PA") && workMins < 240) {
      lessThan4HrMins += 240 - workMins;
    }
  });

  return Math.round(lessThan4HrMins);
};

/**
 * Calculate break excess minutes
 * NOTE: This requires lunch data which needs to be passed in
 */
export const calculateBreakExcessMinutes = (
  employee: EmployeeData,
  lunchData?: any
): number => {
  if (!lunchData || !lunchData.dailyPunches) {
    return 0;
  }

  const BREAKS = [
    { name: "Tea Break 1", start: 10 * 60 + 15, end: 10 * 60 + 30, allowed: 15 },
    { name: "Lunch Break", start: 12 * 60 + 45, end: 13 * 60 + 15, allowed: 30 },
    { name: "Tea Break 2", start: 15 * 60 + 15, end: 15 * 60 + 30, allowed: 15 },
  ];

  let totalExcessMinutes = 0;

  for (const dayData of lunchData.dailyPunches) {
    const punches = dayData.punches || [];
    if (punches.length < 2) continue;

    const punchTimes = punches
      .map((p: any) => ({
        type: p.type,
        minutes: timeToMinutes(p.time),
        time: p.time,
      }))
      .filter((p: any) => p.minutes > 0);

    if (punchTimes.length < 2) continue;

    // Find Out-In pairs (break periods)
    const breakPeriods: any[] = [];
    for (let i = 0; i < punchTimes.length - 1; i++) {
      if (punchTimes[i].type === "Out" && punchTimes[i + 1].type === "In") {
        const outTime = punchTimes[i].minutes;
        const inTime = punchTimes[i + 1].minutes;
        const duration = inTime - outTime;

        if (duration > 0 && duration < 240) {
          breakPeriods.push({
            outMinutes: outTime,
            inMinutes: inTime,
            duration,
          });
        }
      }
    }

    if (breakPeriods.length === 0) continue;

    // Check for post-evening return
    const lastInPunch = punchTimes.filter((p: any) => p.type === "In").pop();
    const hasPostEveningReturn = lastInPunch && lastInPunch.minutes >= 17 * 60 + 30;

    const processedBreaks = new Set<number>();

    // Match breaks with defined periods
    for (let bpIdx = 0; bpIdx < breakPeriods.length; bpIdx++) {
      const bp = breakPeriods[bpIdx];
      let bestMatch: any = null;
      let bestOverlap = 0;

      for (const defBreak of BREAKS) {
        const overlapStart = Math.max(bp.outMinutes, defBreak.start);
        const overlapEnd = Math.min(bp.inMinutes, defBreak.end);
        const overlap = Math.max(0, overlapEnd - overlapStart);

        if (overlap > 0 && overlap > bestOverlap) {
          bestOverlap = overlap;
          bestMatch = defBreak;
        }
      }

      if (bestMatch) {
        const excess = Math.max(0, bp.duration - bestMatch.allowed);
        totalExcessMinutes += excess;
        processedBreaks.add(bpIdx);
      } else if (hasPostEveningReturn && bp.outMinutes >= 17 * 60 + 30) {
        const postEveningAllowed = 15;
        const excess = Math.max(0, bp.duration - postEveningAllowed);
        totalExcessMinutes += excess;
        processedBreaks.add(bpIdx);
      }
    }

    // Unauthorized breaks
    for (let bpIdx = 0; bpIdx < breakPeriods.length; bpIdx++) {
      if (!processedBreaks.has(bpIdx)) {
        const bp = breakPeriods[bpIdx];
        totalExcessMinutes += bp.duration;
      }
    }
  }

  return Math.round(totalExcessMinutes);
};

/**
 * Calculate total combined minutes (with staff relaxation)
 * This is the MASTER calculation that both components should use
 */
export const calculateTotalCombinedMinutes = (
  employee: EmployeeData,
  lunchData?: any,
  customStartMinutes?: number
): {
  lateMinutes: number;
  earlyDepartureMinutes: number;
  breakExcessMinutes: number;
  lessThan4HoursMinutes: number;
  totalBeforeRelaxation: number;
  staffRelaxationApplied: number;
  totalAfterRelaxation: number;
  isStaff: boolean;
} => {
  const isStaff = getIsStaff(employee);

  // Calculate all components
  const lateMinutes = calculateLateMinutes(employee, customStartMinutes);
  const earlyDepartureMinutes = calculateEarlyDepartureMinutes(employee);
  const breakExcessMinutes = calculateBreakExcessMinutes(employee, lunchData);
  const lessThan4HoursMinutes = calculateLessThan4HoursMinutes(employee);

  // Calculate total before relaxation
  const totalBeforeRelaxation =
    lateMinutes + earlyDepartureMinutes + breakExcessMinutes + lessThan4HoursMinutes;

  // Apply staff relaxation
  let staffRelaxationApplied = 0;
  let totalAfterRelaxation = totalBeforeRelaxation;

  if (isStaff) {
    staffRelaxationApplied = STAFF_RELAXATION_MINUTES;
    totalAfterRelaxation = Math.max(0, totalBeforeRelaxation - STAFF_RELAXATION_MINUTES);
  }

  return {
    lateMinutes: Math.round(lateMinutes),
    earlyDepartureMinutes: Math.round(earlyDepartureMinutes),
    breakExcessMinutes: Math.round(breakExcessMinutes),
    lessThan4HoursMinutes: Math.round(lessThan4HoursMinutes),
    totalBeforeRelaxation: Math.round(totalBeforeRelaxation),
    staffRelaxationApplied: Math.round(staffRelaxationApplied),
    totalAfterRelaxation: Math.round(totalAfterRelaxation),
    isStaff,
  };
};