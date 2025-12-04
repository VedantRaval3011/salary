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
  if (inStr.includes("c cash")) return false;
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
  // SPECIAL RULE: Kaplesh Raloliya (143) always has 0 Late
  if (employee.empCode === "143") {
    return 0;
  }

  const EVENING_SHIFT_START_MINUTES = 13 * 60 + 15;
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

      if (status === "P/A" || status === "PA" || 
          status === "ADJ-P/A" || status === "ADJP/A" || status === "ADJ-PA") {
        // P/A: Use morning/evening cutoff logic for ALL days (not just Saturday)
        // Morning shift: before 10:00 AM cutoff → late from 8:30 AM
        // Afternoon shift: after 10:00 AM cutoff → late from 1:15 PM
        if (inMinutes < MORNING_EVENING_CUTOFF_MINUTES) {
          // Morning shift P/A - late from standard start time (8:30 AM)
          if (inMinutes > employeeNormalStartMinutes) {
            dailyLateMins = inMinutes - employeeNormalStartMinutes;
          }
        } else {
          // Afternoon shift P/A - late from 1:15 PM (second shift start)
          const HALF_DAY_START_MINUTES = 13 * 60 + 15; // 1:15 PM
          if (inMinutes > HALF_DAY_START_MINUTES) {
            dailyLateMins = inMinutes - HALF_DAY_START_MINUTES;
          }
          // If between 10:00 AM and 1:15 PM, late is 0 (arrived on time for afternoon shift)
        }
      } else if (status === "P" || ((status === "M/WO-I" || status === "ADJ-M/WO-I") && (day.day?.toLowerCase() === "sa" || day.day?.toLowerCase() === "sat" || day.day?.toLowerCase() === "saturday"))) {
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
 * Rules:
 * - P/A, adj-P/A: Always skip early departure
 * - adj-P: Check work hours. If <= 4 hours (240 mins), treat as adj-P/A (skip). Else count.
 * - Others (P, etc): Count early departure
 */
export const calculateEarlyDepartureMinutes = (
  employee: EmployeeData,
  customEndMinutes?: number
): number => {
  let earlyDepartureTotalMinutes = 0;

  employee.days?.forEach((day) => {
    const status = (day.attendance.status || "").toUpperCase();
    const earlyDepMins = Number(day.attendance.earlyDep) || 0;
    
    // Calculate work minutes to check for half day
    const workHours = day.attendance.workHrs || 0;
    let workMins = 0;
    if (typeof workHours === "string" && workHours.includes(":")) {
      const [h, m] = workHours.split(":").map(Number);
      workMins = h * 60 + (m || 0);
    } else if (!isNaN(Number(workHours))) {
      workMins = Number(workHours) * 60;
    }

    // Fallback: Calculate from In/Out if workMins is 0
    if (workMins === 0 && day.attendance.inTime && day.attendance.outTime && day.attendance.inTime !== "-" && day.attendance.outTime !== "-") {
       const inM = timeToMinutes(day.attendance.inTime);
       const outM = timeToMinutes(day.attendance.outTime);
       if (outM > inM) {
           workMins = outM - inM;
       }
    }

    const isHalfDay = workMins > 0 && workMins <= 240;

    // 1. Skip early departure for explicit P/A and adj-P/A statuses
    if (status === "P/A" || status === "PA" || 
        status === "ADJ-P/A" || status === "ADJP/A" || status === "ADJ-PA") {
      return; // Skip
    }

    // 2. Handle adj-P
    if (status === "ADJ-P" || status === "ADJP") {
      if (isHalfDay) {
        // Treat as adj-P/A -> Skip early departure
        return;
      }
      // Else (Full Day adj-P) -> Count early departure
    }
    
    // 3. Handle M/WO-I and ADJ-M/WO-I - skip unless Saturday and arrived
    if (status === "M/WO-I" || status === "ADJ-M/WO-I") {
      const dayName = (day.day || "").toLowerCase();
      const isSaturday = dayName === "sa" || dayName === "sat" || dayName === "saturday";
      const hasArrived = day.attendance.inTime && day.attendance.inTime !== "-";
      
      if (!isSaturday || !hasArrived) {
        return; // Skip early departure
      }
      // If Saturday and arrived, continue to calculate early departure
    }
    
    // 4. Count for others (P, Full Day adj-P, etc.)
    let dailyEarlyDep = 0;
    if (customEndMinutes && day.attendance.outTime && day.attendance.outTime !== "-") {
      const outMinutes = timeToMinutes(day.attendance.outTime);
      if (outMinutes < customEndMinutes) {
        dailyEarlyDep = customEndMinutes - outMinutes;
      }
    } else {
      dailyEarlyDep = earlyDepMins;
    }

    if (dailyEarlyDep > 0) {
      earlyDepartureTotalMinutes += dailyEarlyDep;
    }
  });

  return Math.round(earlyDepartureTotalMinutes);
};

/**
 * Calculate less than 4 hours on P/A days
 */
export const calculateLessThan4HoursMinutes = (employee: EmployeeData): number => {
  // Logic removed to prevent double deduction with Early Departure
  return 0;
};

/**
 * Calculate total combined deduction minutes
 * Including staff relaxation if applicable
 */
export const calculateTotalDeductionMinutes = (
  employee: EmployeeData,
  breakExcessMinutes: number = 0,
  employeeNormalStartMinutes?: number,
  customEndMinutes?: number
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

  // SPECIAL RULE: Kaplesh Raloliya (143) always has 0 Total Deduction
  if (employee.empCode === "143") {
    return {
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      lessThan4HoursMinutes: 0,
      breakExcessMinutes: 0,
      subtotal: 0,
      staffRelaxation: 0,
      total: 0,
      isStaff: getIsStaff(employee),
    };
  }

  const lateMinutes = calculateLateMinutes(employee, employeeNormalStartMinutes);
  const earlyDepartureMinutes = calculateEarlyDepartureMinutes(employee, customEndMinutes);
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