// @/lib/lateCalculations.ts
// Unified late arrival and total deduction calculations
// SINGLE SOURCE OF TRUTH for all late/early departure calculations

import { EmployeeData } from "@/lib/types";

const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + (minutes || 0);
};

export const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${emp.department ?? ""}`.toLowerCase();
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  return true;
};

/**
 * Calculate late arrival minutes for an employee
 * This is the SINGLE SOURCE OF TRUTH for late calculations
 */
export const calculateLateMinutes = (
  employee: EmployeeData,
  employeeNormalStartMinutes: number = 8 * 60 + 30
): number => {
  const EVENING_SHIFT_START_MINUTES = 12 * 60 + 45;
  const MORNING_EVENING_CUTOFF_MINUTES = 10 * 60;
  const PERMISSIBLE_LATE_MINS = 5;

  const isStaff = getIsStaff(employee);
  let lateMinsTotal = 0;

  employee.days?.forEach((day) => {
    const status = (day.attendance.status || "").toUpperCase();
    const inTime = day.attendance.inTime;

    if (inTime && inTime !== "-") {
      const inMinutes = timeToMinutes(inTime);
      let dailyLateMins = 0;

      if (status === "P/A" || status === "PA") {
        // P/A: Check if morning or evening shift
        if (inMinutes < MORNING_EVENING_CUTOFF_MINUTES) {
          // Morning shift
          if (inMinutes > employeeNormalStartMinutes) {
            dailyLateMins = inMinutes - employeeNormalStartMinutes;
          }
        } else {
          // Evening shift
          if (inMinutes > EVENING_SHIFT_START_MINUTES) {
            dailyLateMins = inMinutes - EVENING_SHIFT_START_MINUTES;
          }
        }
      } else if (status === "P") {
        // Full day present
        if (inMinutes > employeeNormalStartMinutes) {
          dailyLateMins = inMinutes - employeeNormalStartMinutes;
        }
      } else if (isStaff && status === "ADJ-P") {
        // ADJ-P: Only count for Staff
        if (inMinutes > employeeNormalStartMinutes) {
          dailyLateMins = inMinutes - employeeNormalStartMinutes;
        }
      }

      // Only count if exceeds permissible grace period
      if (dailyLateMins > PERMISSIBLE_LATE_MINS) {
        lateMinsTotal += dailyLateMins;
      }
    }
  });

  return Math.round(lateMinsTotal);
};

/**
 * Calculate early departure minutes
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
 * Calculate total combined deduction minutes
 * Including staff relaxation if applicable
 */
export const calculateTotalDeductionMinutes = (
  employee: EmployeeData,
  breakExcessMinutes: number = 0,
  employeeNormalStartMinutes?: number
): {
  lateMinutes: number;
  earlyDepartureMinutes: number;
  lessThan4HoursMinutes: number;
  breakExcessMinutes: number;
  subtotal: number;
  staffRelaxation: number;
  total: number;
  isStaff: boolean;
} => {
  const STAFF_RELAXATION_MINUTES = 4 * 60;

  const lateMinutes = calculateLateMinutes(employee, employeeNormalStartMinutes);
  const earlyDepartureMinutes = calculateEarlyDepartureMinutes(employee);
  const lessThan4HoursMinutes = calculateLessThan4HoursMinutes(employee);
  
  const isStaff = getIsStaff(employee);

  // Calculate subtotal before relaxation
  const subtotal = lateMinutes + earlyDepartureMinutes + breakExcessMinutes + lessThan4HoursMinutes;

  // Apply staff relaxation
  const staffRelaxation = isStaff ? STAFF_RELAXATION_MINUTES : 0;
  const total = Math.max(0, subtotal - staffRelaxation);

  return {
    lateMinutes: Math.round(lateMinutes),
    earlyDepartureMinutes: Math.round(earlyDepartureMinutes),
    lessThan4HoursMinutes: Math.round(lessThan4HoursMinutes),
    breakExcessMinutes: Math.round(breakExcessMinutes),
    subtotal: Math.round(subtotal),
    staffRelaxation: Math.round(staffRelaxation),
    total: Math.round(total),
    isStaff,
  };
};