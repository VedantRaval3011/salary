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
  if (inStr.includes("c cash")) return false;
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
  // SPECIAL RULE: Kaplesh Raloliya (143) always has 0 Late
  if (employee.empCode === "143" || employee.empName?.toLowerCase().includes("kaplesh")) {
    return 0;
  }

  const isStaff = getIsStaff(employee);
  const employeeNormalStartMinutes = customStartMinutes ?? STANDARD_START_MINUTES;
  let lateMinsTotal = 0;

  employee.days?.forEach((day) => {
    const status = (day.attendance.status || "").toUpperCase();
    const inTime = day.attendance.inTime;

    if (inTime && inTime !== "-") {
      const inMinutes = timeToMinutes(inTime);
      let dailyLateMins = 0;

      // ⭐ STRICT CUSTOM TIMING RULE:
      // If customStartMinutes is provided, use it strictly for ALL statuses (P, P/A, etc.)
      if (customStartMinutes !== undefined) {
        if (inMinutes > employeeNormalStartMinutes) {
          dailyLateMins = inMinutes - employeeNormalStartMinutes;
        }
      } else {
        // Standard Logic
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
        } else if (status === "P" || ((status === "M/WO-I" || status === "ADJ-M/WO-I") && (day.day?.toLowerCase() === "sa" || day.day?.toLowerCase() === "sat" || day.day?.toLowerCase() === "saturday"))) {
          if (inMinutes > employeeNormalStartMinutes) {
            dailyLateMins = inMinutes - employeeNormalStartMinutes;
          }
        } else if (isStaff && status === "ADJ-P") {
          if (inMinutes > employeeNormalStartMinutes) {
            dailyLateMins = inMinutes - employeeNormalStartMinutes;
          }
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
    
    // Skip early departure for P/A and adj-P/A
    if (status === "P/A" || status === "PA" || status === "ADJ-P/A" || status === "ADJP/A" || status === "ADJ-PA") {
      return;
    }

    // Skip early departure for half-day adj-P
    const isAdjPHalfDay = (status === "ADJ-P" || status === "ADJP") && workMins > 0 && workMins <= 320;
    if (isAdjPHalfDay) {
      return;
    }

    // Ignore early departure completely if status is "M/WO-I" UNLESS it is Saturday and they arrived
    if (status === "M/WO-I" || status === "ADJ-M/WO-I") {
      const dayName = (day.day || "").toLowerCase();
      const isSaturday = dayName === "sa" || dayName === "sat" || dayName === "saturday";
      const hasArrived = day.attendance.inTime && day.attendance.inTime !== "-";
      
      if (!isSaturday || !hasArrived) {
        return;
      }
      // If Saturday and arrived, continue to calculate early departure
    }

    // Calculate early departure
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
 * Calculate break excess minutes
 * 
 * RULES:
 * 1. Staff employees: NO break excess (return 0) - unless they are in OT Granted sheet
 * 2. Workers: Calculate break excess with proper breaks:
 *    - Before 5:30 PM: Standard break windows (Tea 1, Lunch, Tea 2)
 *    - 5:30 PM to 6:30 PM: 15 mins evening break allowed
 *    - 7:30 PM to 9:00 PM: 30 mins dinner break allowed
 * 3. OT Granted employees: Full break excess calculation (all breaks)
 */
export const calculateBreakExcessMinutes = (
  employee: EmployeeData,
  punchData?: { attendance: { [date: string]: { in: string[]; out: string[] } } },
  isMaintenance: boolean = false,
  isGrantedOT: boolean = false
): number => {
  // Debug logging
  console.log(`🔍 calculateBreakExcessMinutes for ${employee.empCode}:`, {
    hasPunchData: !!punchData,
    hasAttendance: !!(punchData?.attendance),
    attendanceKeys: punchData?.attendance ? Object.keys(punchData.attendance).length : 0,
    isGrantedOT
  });

  if (!punchData || !punchData.attendance) {
    console.log(`❌ No punch data for ${employee.empCode}`);
    return 0;
  }

  // ⭐ RULES:
  // 1. For ALL employees: Calculate break excess for breaks BEFORE 5:30 PM
  // 2. For breaks AFTER 5:30 PM: Only calculate if employee is OT Granted
  
  // Define break windows
  const BREAKS = [
    { name: "Tea Break 1", start: 10 * 60 + 15, end: 10 * 60 + 30, allowed: 15 }, // 10:15 - 10:30
    { name: "Lunch Break", start: 12 * 60 + 30, end: 14 * 60, allowed: 30 },      // 12:30 - 14:00
    { name: "Tea Break 2", start: 15 * 60 + 15, end: 15 * 60 + 30, allowed: 15 }, // 15:15 - 15:30
    // Evening Break: 5:30 PM to 6:30 PM - 15 mins allowed
    { 
      name: "Evening Break", 
      start: 17 * 60 + 30, // 5:30 PM
      end: 18 * 60 + 30,   // 6:30 PM
      allowed: 15 
    },
    // Dinner Break: 7:30 PM to 9:00 PM - 30 mins allowed
    { name: "Dinner Break", start: 19 * 60 + 30, end: 21 * 60, allowed: 30 },     // 19:30 - 21:00
  ];



  let totalExcessMinutes = 0;

  // Iterate through all dates in the punch data
  for (const [date, dayData] of Object.entries(punchData.attendance)) {
    const ins = dayData.in || [];
    const outs = dayData.out || [];
    
    if (ins.length === 0 || outs.length === 0) continue;
    
    // Combine In and Out punches
    const punches: any[] = [];
    
    ins.forEach((time: string) => {
      const minutes = timeToMinutes(time);
      if (minutes > 0) {
        punches.push({ type: "In", time, minutes });
      }
    });
    
    outs.forEach((time: string) => {
      const minutes = timeToMinutes(time);
      if (minutes > 0) {
        punches.push({ type: "Out", time, minutes });
      }
    });
    
    // Sort by time
    punches.sort((a, b) => a.minutes - b.minutes);

    // ⭐ Clean up invalid punch sequences (IN-IN or OUT-OUT)
    // Valid pattern should be: IN, OUT, IN, OUT, ...
    const cleanedPunches: any[] = [];
    let expectedNext: "In" | "Out" = "In"; // We expect to start with IN
    
    for (const punch of punches) {
      if (punch.type === expectedNext) {
        cleanedPunches.push(punch);
        expectedNext = expectedNext === "In" ? "Out" : "In";
      }
      // Skip invalid punches silently
    }

    if (cleanedPunches.length < 2) continue;

    // ⭐ Calculate break excess for valid Out-In pairs
    for (let i = 0; i < cleanedPunches.length - 1; i++) {
      const current = cleanedPunches[i];
      const next = cleanedPunches[i+1];
      
      // Only process if current is Out and next is In (break period)
      // AND ensure Out time is before In time
      if (current.type === "Out" && next.type === "In" && current.minutes < next.minutes) {
        const outMin = current.minutes;
        const inMin = next.minutes;
        const duration = inMin - outMin;
        
        if (duration > 0) {
          // ⭐ REFINED LOGIC (Final v3):
          // 1. Maintenance Employees: ALWAYS calculate excess (User: "Break excess has to be calccualted ater 5:30 for this employee")
          // 2. Non-Maintenance Employees: 
          //    - Before 5:30 PM: Calculate Excess
          //    - After 5:30 PM: NO break excess (User: "not maintenece employee ... show it as 0")
          
          const EVENING_CUTOFF = 17 * 60 + 30; // 5:30 PM

          // If !Maintenance AND !Worker (i.e. is Staff) AND break starts after 5:30 PM -> Skip
          const isWorker = !getIsStaff(employee);
          if (!isMaintenance && !isWorker && outMin >= EVENING_CUTOFF) {
             continue; 
          }
          
          let allowed = 0;
          
          // Calculate allowed time based on break window overlaps
          for (const defBreak of BREAKS) {
            const overlapStart = Math.max(outMin, defBreak.start);
            const overlapEnd = Math.min(inMin, defBreak.end);
            const overlap = Math.max(0, overlapEnd - overlapStart);
            if (overlap > 0) allowed += defBreak.allowed;
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
  punchData?: { attendance: { [date: string]: { in: string[]; out: string[] } } },
  customStartMinutes?: number,
  customEndMinutes?: number,
  isMaintenance: boolean = false,
  isGrantedOT: boolean = false
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
  // SPECIAL RULE: Kaplesh Raloliya (143) always has 0 Total Deduction
  if (employee.empCode === "143") {
    return {
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      breakExcessMinutes: 0,
      lessThan4HoursMinutes: 0,
      totalBeforeRelaxation: 0,
      staffRelaxationApplied: 0,
      totalAfterRelaxation: 0,
      isStaff: getIsStaff(employee),
    };
  }

  const isStaff = getIsStaff(employee);

  // Calculate all components
  const lateMinutes = calculateLateMinutes(employee, customStartMinutes);
  const earlyDepartureMinutes = calculateEarlyDepartureMinutes(employee, customEndMinutes);
  const breakExcessMinutes = calculateBreakExcessMinutes(employee, punchData, isMaintenance, isGrantedOT);
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