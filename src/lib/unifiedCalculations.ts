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
 * Rules:
 * - P/A, adj-P/A: Always skip early departure
 * - adj-P: Check work hours. If <= 4 hours (240 mins), treat as adj-P/A (skip). Else count.
 * - Others (P, etc): Count early departure
 */
export const calculateEarlyDepartureMinutes = (employee: EmployeeData): number => {
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
    
    // 3. Count for others (P, Full Day adj-P, etc.)
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
    { name: "Lunch Break", start: 12 * 60, end: 14 * 60 + 30, allowed: 30 },
    { name: "Tea Break 2", start: 15 * 60 + 15, end: 15 * 60 + 30, allowed: 15 },
  ];

  let totalExcessMinutes = 0;

  for (const dayData of lunchData.dailyPunches) {
    const punches = dayData.punches || [];
    if (punches.length < 2) continue;

    // ⭐ STEP 1: Convert to minutes, filter invalid, and sort
    let punchTimes = punches
      .map((p: any) => ({
        type: p.type,
        minutes: timeToMinutes(p.time),
        time: p.time,
      }))
      .filter((p: any) => p.minutes > 0)
      .sort((a: any, b: any) => a.minutes - b.minutes);

    // ⭐ STEP 2: Clean up invalid punch sequences (IN-IN or OUT-OUT)
    // Valid pattern should be: IN, OUT, IN, OUT, ...
    const cleanedPunches: any[] = [];
    let expectedNext: "In" | "Out" = "In"; // We expect to start with IN
    
    for (const punch of punchTimes) {
        if (punch.type === expectedNext) {
            cleanedPunches.push(punch);
            expectedNext = expectedNext === "In" ? "Out" : "In";
        }
        // Skip invalid punches silently
    }
    
    punchTimes = cleanedPunches;

    if (punchTimes.length < 2) continue;

    // ⭐ Calculate break excess for valid Out-In pairs
    for (let i = 0; i < punchTimes.length - 1; i++) {
        const current = punchTimes[i];
        const next = punchTimes[i+1];
        
        // Only process if current is Out and next is In (break period)
        // AND ensure Out time is before In time
        if (current.type === "Out" && next.type === "In" && current.minutes < next.minutes) {
            const outMin = current.minutes;
            let inMin = next.minutes;

            // [NEW LOGIC] Handle 5:30 PM cutoff for non-fullnight employees
            const isFullNight = employee.otGrantedType === "fullnight";
            const CUTOFF_TIME = 17 * 60 + 30; // 17:30 (5:30 PM)

            if (!isFullNight) {
                if (outMin >= CUTOFF_TIME) {
                    // Break starts after 5:30 PM, ignore completely
                    continue;
                }
                if (inMin > CUTOFF_TIME) {
                    // Break ends after 5:30 PM, truncate to 5:30 PM
                    inMin = CUTOFF_TIME;
                }
            }

            const duration = inMin - outMin;
            
            if (duration > 0) {
                 let allowed = 0;
                 
                 // Calculate allowed time based on break window overlaps
                 for (const defBreak of BREAKS) {
                    const overlapStart = Math.max(outMin, defBreak.start);
                    const overlapEnd = Math.min(inMin, defBreak.end);
                    const overlap = Math.max(0, overlapEnd - overlapStart);
                    if (overlap > 0) allowed += defBreak.allowed;
                 }
                 
                 // Evening break allowance (after 5:30 PM)
                 if (outMin >= 17 * 60 + 30 || inMin >= 17 * 60 + 30) {
                    allowed = Math.max(allowed, 15);
                 }
                 
                 const excess = Math.max(0, duration - allowed);
                 totalExcessMinutes += excess;
            }
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