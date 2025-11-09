"use client";

import React, { useMemo, useState } from "react";
import { EmployeeData } from "@/lib/types";
import { useExcel } from "../context/ExcelContext"; // Corrected import path

// Utility helpers
const canon = (s: string) => (s ?? "").toUpperCase().trim();
// ... (rest of helper functions)
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");
const nameKey = (s: string) => stripNonAlnum(s);

// [NEW] Helper to check if employee is Staff or Worker
const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${
    emp.department ?? ""
  }`.toLowerCase();
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  // default to staff if not clear
  return true;
};

// ---- Paid Leave Lookup Hook ---- //
function usePaidLeaveLookup() {
  // ... (existing code, no changes)
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
    const plRows = files
      .filter(
        (f) =>
          f.status === "success" &&
          Array.isArray(f.paidLeaveData) &&
          f.paidLeaveData.length > 0
      )
      .flatMap((f) => f.paidLeaveData!);

    type PLRec = (typeof plRows)[number] & {
      _keys: string[];
      _nameKey: string;
    };

    const withKeys: PLRec[] = plRows.map((pl) => {
      const raw = canon(pl.empCode);
      const s1 = stripNonAlnum(raw);
      const num = numericOnly(raw);
      const no0 = dropLeadingZeros(num);
      const pads = [4, 5, 6].map((w) => num.padStart(w, "0"));
      const keySet = new Set<string>([raw, s1, num, no0, ...pads]);
      return {
        ...pl,
        _keys: Array.from(keySet),
        _nameKey: nameKey(pl.empName),
      };
    });

    const byKey = new Map<string, PLRec>();
    const byName = new Map<string, PLRec[]>();
    withKeys.forEach((pl) => {
      pl._keys.forEach((k) => byKey.set(k, pl));
      const arr = byName.get(pl._nameKey) ?? [];
      arr.push(pl);
      byName.set(pl._nameKey, arr);
    });

    const getPL = (emp: Pick<EmployeeData, "empCode" | "empName">): number => {
      const raw = canon(emp.empCode);
      const s1 = stripNonAlnum(raw);
      const num = numericOnly(raw);
      const no0 = dropLeadingZeros(num);
      const pads = [4, 5, 6].map((w) => num.padStart(w, "0"));
      const candidates = [raw, s1, num, no0, ...pads];
      for (const k of candidates) {
        const hit = byKey.get(k);
        if (hit) return hit.paidDays ?? 0;
      }
      const foundByName = byName.get(nameKey(emp.empName)) ?? [];
      if (foundByName.length === 1) return foundByName[0].paidDays ?? 0;
      return 0;
    };

    return { getPL };
  }, [getAllUploadedFiles]);
}

/**
 * ---- Full Night Stay OT Lookup Hook ----
 */
function useFullNightOTLookup() {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];

    // Find Full Night Stay OT file
    const fullNightFile = files.find((f: any) => {
      const n = (f?.fileName || "").toString().toLowerCase();
      return (
        f.status === "success" &&
        n.includes("full") &&
        n.includes("night") &&
        n.includes("stay")
      );
    });

    if (!fullNightFile) {
      return { getFullNightOTForEmployee: () => 0 };
    }

    console.log("✅ Full Night Stay OT file detected:", fullNightFile.fileName);

    // Extract Full Night OT employees
    let fullNightEmployees: any[] = [];

    if (
      fullNightFile.fullNightOTData &&
      Array.isArray(fullNightFile.fullNightOTData)
    ) {
      fullNightEmployees = fullNightFile.fullNightOTData;
    } else if (
      fullNightFile.data?.employees &&
      Array.isArray(fullNightFile.data.employees)
    ) {
      fullNightEmployees = fullNightFile.data.employees;
    }

    // Create lookup map - aggregate total hours per employee
    const norm = (s: string) => (s ?? "").toString().toUpperCase().trim();
    const key = (s: string) => norm(s).replace(/[^A-Z0-9]/g, "");
    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";

    const employeeByCode = new Map<string, number>();
    const employeeByName = new Map<string, number>();

    for (const emp of fullNightEmployees) {
      const hours = Number(emp.totalHours) || 0;

      if (emp.empCode) {
        const codeKey = key(emp.empCode);
        const numKey = numOnly(emp.empCode);

        // Add for the main key
        const current = employeeByCode.get(codeKey) || 0;
        employeeByCode.set(codeKey, current + hours);

        // [FIX] ONLY add for numKey if it's DIFFERENT from codeKey
        if (numKey && numKey !== codeKey) {
          const currentNum = employeeByCode.get(numKey) || 0;
          employeeByCode.set(numKey, currentNum + hours);
        }
      }

      if (emp.empName) {
        const nameKey = key(emp.empName);
        const current = employeeByName.get(nameKey) || 0;
        employeeByName.set(nameKey, current + hours);
      }
    }

    const getFullNightOTForEmployee = (
      emp: Pick<EmployeeData, "empCode" | "empName">
    ): number => {
      const empCodeK = key(emp.empCode);
      const empNameK = key(emp.empName);
      const numCodeK = numOnly(emp.empCode);

      // Try code match first
      let totalHours = employeeByCode.get(empCodeK);

      // Try numeric code
      if (totalHours === undefined && numCodeK) {
        totalHours = employeeByCode.get(numCodeK);
      }

      // Try name match
      if (totalHours === undefined) {
        totalHours = employeeByName.get(empNameK);
      }

      return totalHours || 0;
    };

    return { getFullNightOTForEmployee };
  }, [getAllUploadedFiles]);
}

/**
 * ---- 09 to 06 Custom Timing Lookup Hook ----
 * Returns the custom timing info (not hours, just the timing string)
 */
function useCustomTimingLookup() {
  // ... (existing code, no changes)
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];

    // Find 09 to 06 Time Granted file
    const customTimingFile = files.find((f: any) => {
      const n = (f?.fileName || "").toString().toLowerCase();
      return (
        f.status === "success" &&
        ((n.includes("09") && n.includes("06") && n.includes("time")) ||
          (n.includes("9") && n.includes("6") && n.includes("granted")))
      );
    });

    if (!customTimingFile) {
      return { getCustomTimingForEmployee: () => null };
    }

    console.log(
      "✅ 09 to 06 Time Granted file detected:",
      customTimingFile.fileName
    );

    // Extract employees
    let customTimingEmployees: any[] = [];

    if (
      customTimingFile.customTimingOTData &&
      Array.isArray(customTimingFile.customTimingOTData)
    ) {
      customTimingEmployees = customTimingFile.customTimingOTData;
    } else if (
      customTimingFile.data?.employees &&
      Array.isArray(customTimingFile.data.employees)
    ) {
      customTimingEmployees = customTimingFile.data.employees;
    }

    // Create lookup map
    const norm = (s: string) => (s ?? "").toString().toUpperCase().trim();
    const key = (s: string) => norm(s).replace(/[^A-Z0-9]/g, "");
    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";

    const employeeByCode = new Map<string, any>();
    const employeeByName = new Map<string, any>();

    for (const emp of customTimingEmployees) {
      if (emp.empCode) {
        const codeKey = key(emp.empCode);
        const numKey = numOnly(emp.empCode);
        employeeByCode.set(codeKey, emp);
        if (numKey) employeeByCode.set(numKey, emp);
      }

      if (emp.empName) {
        const nameKey = key(emp.empName);
        employeeByName.set(nameKey, emp);
      }
    }

    const getCustomTimingForEmployee = (
      emp: Pick<EmployeeData, "empCode" | "empName">
    ): {
      customTime: string;
      expectedEndMinutes: number;
      expectedStartMinutes: number;
    } | null => {
      const empCodeK = key(emp.empCode);
      const empNameK = key(emp.empName);
      const numCodeK = numOnly(emp.empCode);

      // Try code match first
      let found = employeeByCode.get(empCodeK);

      // Try numeric code
      if (!found && numCodeK) {
        found = employeeByCode.get(numCodeK);
      }

      // Try name match
      if (!found) {
        found = employeeByName.get(empNameK);
      }

      if (!found || !found.customTime) return null;

      // Parse custom time to get expected end time
      const timeStr = found.customTime;
      const match = timeStr.match(
        /(\d{1,2}):(\d{2})\s*TO\s*(\d{1,2}):(\d{2})/i
      );

      if (match) {
        // Use (match[2] || "0") to handle cases like "9:00"
        const startHour = parseInt(match[1]);
        const startMin = parseInt(match[2] || "0");
        const expectedStartMinutes = startHour * 60 + startMin;

        const endHour = parseInt(match[3]);
        const endMin = parseInt(match[4] || "0");
        const expectedEndMinutes = endHour * 60 + endMin;

        return {
          customTime: timeStr,
          expectedEndMinutes,
          expectedStartMinutes,
        };
      }

      return null;
    };

    return { getCustomTimingForEmployee };
  }, [getAllUploadedFiles]);
}

/**
 * ---- Staff OT Granted Lookup Hook ----
 */
function useStaffOTGrantedLookup() {
  // ... (existing code, no changes)
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];

    // Find Staff OT Granted file
    const staffOTFile = files.find((f: any) => {
      const n = (f?.fileName || "").toString().toLowerCase();
      return (
        f.status === "success" &&
        n.includes("staff") &&
        n.includes("ot") &&
        n.includes("granted")
      );
    });

    if (!staffOTFile) {
      return { getGrantForEmployee: () => undefined };
    }

    console.log("✅ Staff OT Granted file detected:", staffOTFile.fileName);

    // Extract OT employees from the file
    let otEmployees: any[] = [];

    if (staffOTFile.otGrantedData && Array.isArray(staffOTFile.otGrantedData)) {
      otEmployees = staffOTFile.otGrantedData;
    } else if (
      staffOTFile.data?.employees &&
      Array.isArray(staffOTFile.data.employees)
    ) {
      otEmployees = staffOTFile.data.employees;
    }

    // Create lookup maps with fuzzy matching
    const norm = (s: string) => (s ?? "").toString().toUpperCase().trim();
    const key = (s: string) => norm(s).replace(/[^A-Z0-9]/g, "");
    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";

    const byCode = new Map<string, any>();
    const byName = new Map<string, any>();
    const byNumericCode = new Map<string, any>();

    for (const emp of otEmployees) {
      if (emp.empCode) {
        const codeKey = key(emp.empCode);
        const numKey = numOnly(emp.empCode);

        byCode.set(codeKey, emp);
        if (numKey) byNumericCode.set(numKey, emp);
      }
      if (emp.empName) {
        byName.set(key(emp.empName), emp);
      }
    }

    const getGrantForEmployee = (
      emp: Pick<EmployeeData, "empCode" | "empName">
    ) => {
      const empCodeK = key(emp.empCode);
      const empNameK = key(emp.empName);
      const numCodeK = numOnly(emp.empCode);

      // Try exact code match first
      let found = byCode.get(empCodeK);

      // Try numeric code match
      if (!found && numCodeK) {
        found = byNumericCode.get(numCodeK);
      }

      // Try name match as fallback
      if (!found) {
        found = byName.get(empNameK);
      }

      if (found) {
        console.log(
          `✅ Employee "${emp.empName}" (${emp.empCode}) is in OT Granted list (Days: ${found.fromDate}-${found.toDate})`
        );
      }

      return found;
    };

    return { getGrantForEmployee };
  }, [getAllUploadedFiles]);
}

/**
 * ---- Maintenance OT Deduct Lookup Hook ----
 * Checks if an employee is in the "Maintenance Employee OT Deduct" file.
 */
function useMaintenanceDeductLookup() {
  // ... (existing code, no changes)
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];

    // 1. Find the Maintenance Deduct file
    const deductFile = files.find((f: any) => {
      const n = (f?.fileName || "").toString().toLowerCase();
      return (
        f.status === "success" &&
        n.includes("maintenance") &&
        n.includes("deduct")
      );
    });

    if (!deductFile) {
      // No file found, so no deduction applies
      return { isMaintenanceEmployee: () => false };
    }

    console.log("✅ Maintenance OT Deduct file detected:", deductFile.fileName);

    // 2. Extract employee data from the file
    // Assumes the file processor populates 'data.employees'
    let maintenanceEmployees: any[] = [];
    if (
      deductFile.data?.employees &&
      Array.isArray(deductFile.data.employees)
    ) {
      maintenanceEmployees = deductFile.data.employees;
    } else {
      console.warn(
        "⚠️ Maintenance deduct file found, but no 'data.employees' array inside."
      );
      return { isMaintenanceEmployee: () => false };
    }

    // 3. Create lookup Sets for fast checking
    const norm = (s: string) => (s ?? "").toString().toUpperCase().trim();
    const key = (s: string) => norm(s).replace(/[^A-Z0-9]/g, "");
    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";

    const employeeCodeSet = new Set<string>();
    const employeeNameSet = new Set<string>();

    for (const emp of maintenanceEmployees) {
      // The CSV snippet shows 'EMP. CODE', so we check for both conventions
      const code = emp.empCode || emp["EMP. CODE"];
      const name = emp.empName || emp.NAME;

      if (code) {
        employeeCodeSet.add(key(String(code)));
        employeeCodeSet.add(numOnly(String(code)));
      }
      if (name) {
        employeeNameSet.add(key(String(name)));
      }
    }

    // 4. Return a checker function
    const isMaintenanceEmployee = (
      emp: Pick<EmployeeData, "empCode" | "empName">
    ): boolean => {
      const empCodeK = key(emp.empCode);
      const empNameK = key(emp.empName);
      const numCodeK = numOnly(emp.empCode);

      if (employeeCodeSet.has(empCodeK)) return true;
      if (employeeCodeSet.has(numCodeK)) return true;
      if (employeeNameSet.has(empNameK)) return true;

      return false;
    };

    return { isMaintenanceEmployee };
  }, [getAllUploadedFiles]);
}

// ---- Component ---- //
interface Props {
  // ... (existing code, no changes)
  employee: EmployeeData;
  baseHolidaysCount?: number;
  selectedHolidaysCount?: number;
}

// Moved helper function outside component
const timeToMinutes = (timeStr: string): number => {
  // ... (existing code, no changes)
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + (minutes || 0);
};

export const PresentDayStatsGrid: React.FC<Props> = ({
  // ... (existing code, no changes)
  employee,
  baseHolidaysCount = 0,
  selectedHolidaysCount = 0,
}) => {
  const [tooltips, setTooltips] = useState<{ [k: string]: boolean }>({});
  const { getPL } = usePaidLeaveLookup();
  // ... (existing code, no changes)
  const { getGrantForEmployee } = useStaffOTGrantedLookup();
  const { getFullNightOTForEmployee } = useFullNightOTLookup();
  const { getCustomTimingForEmployee } = useCustomTimingLookup();
  const { isMaintenanceEmployee } = useMaintenanceDeductLookup();

  const stats = useMemo(() => {
    // ... (existing code... all calculations are correct)
    // Count present and adjustment days
    let paCount = 0;
    let fullPresentDays = 0;
    let adjPresentDays = 0;

    employee.days?.forEach((day) => {
      const status = (day.attendance.status || "").toUpperCase();
      if (status === "P") fullPresentDays++;
      else if (status === "P/A" || status === "PA") paCount++;
      else if (status === "ADJ-P") adjPresentDays++;
    });

    const PD_excel = employee.present || 0;
    const paAdjustment = paCount * 0.5;
    const PAA = fullPresentDays + adjPresentDays + paAdjustment;
    const H_base = selectedHolidaysCount || baseHolidaysCount || 0;
    const Total = PAA + H_base;

    // --- [MODIFIED] Recalculate Late Mins Total with Grace Period ---
    const customTiming = getCustomTimingForEmployee(employee);
    let lateMinsTotal = 0;
    let wasOTDeducted = false; // <-- Flag for 5% deduction

    // [NEW] Determine if employee is staff or worker
    const isStaff = getIsStaff(employee);
    const isWorker = !isStaff;
    console.log(
      `👷 ${employee.empName} is ${isWorker ? "Worker" : "Staff"}. Applying ${
        isWorker ? "Worker" : "Staff"
      } late policy for PresentDayStatsGrid.`
    );

    // Define shift start times in minutes
    const STANDARD_START_MINUTES = 8 * 60 + 30; // 8:30 AM = 510
    const EVENING_SHIFT_START_MINUTES = 12 * 60 + 45; // 12:45 PM = 765

    // Define the cutoff time to decide between morning/evening P/A
    const MORNING_EVENING_CUTOFF_MINUTES = 10 * 60; // 10:00 AM = 600

    // Define permissible late minutes
    const PERMISSIBLE_LATE_MINS = 5;

    // Determine the employee's "normal" start time (standard or custom)
    const employeeNormalStartMinutes =
      customTiming?.expectedStartMinutes ?? STANDARD_START_MINUTES;

    employee.days?.forEach((day) => {
      const status = (day.attendance.status || "").toUpperCase();
      const inTime = day.attendance.inTime;

      if (!inTime || inTime === "-") {
        return; // No in-time, so no late minutes
      }

      const inMinutes = timeToMinutes(inTime);
      let dailyLateMins = 0; // Calculate daily late first

      if (status === "P/A" || status === "PA") {
        // Smart P/A logic
        if (inMinutes < MORNING_EVENING_CUTOFF_MINUTES) {
          // It's a MORNING half-day, check against normal start
          if (inMinutes > employeeNormalStartMinutes) {
            dailyLateMins = inMinutes - employeeNormalStartMinutes;
          }
        } else {
          // It's an EVENING half-day, check against evening start
          if (inMinutes > EVENING_SHIFT_START_MINUTES) {
            dailyLateMins = inMinutes - EVENING_SHIFT_START_MINUTES;
          }
        }
      }
      // [MODIFIED] Apply Staff/Worker logic for ADJ-P
      else if (status === "P") {
        // 'P' (Full Day Present) is ALWAYS checked for lates
        if (inMinutes > employeeNormalStartMinutes) {
          dailyLateMins = inMinutes - employeeNormalStartMinutes;
        }
      } else if (isStaff && status === "ADJ-P") {
        // 'ADJ-P' is ONLY checked for lates if employee is STAFF
        console.log(`  -> Day ${day.date}: Checking ADJ-P for late (is Staff)`);
        if (inMinutes > employeeNormalStartMinutes) {
          dailyLateMins = inMinutes - employeeNormalStartMinutes;
        }
      } else if (isWorker && status === "ADJ-P") {
        // 'ADJ-P' is SKIPPED for lates if employee is WORKER
        console.log(
          `  -> Day ${day.date}: Skipping ADJ-P for late (is Worker)`
        );
        // dailyLateMins remains 0
      }
      // [END OF MODIFICATION]

      // For any other status (A, H, WO), do nothing.

      // [NEW] Apply the 5-minute grace period
      if (dailyLateMins > PERMISSIBLE_LATE_MINS) {
        lateMinsTotal += dailyLateMins; // Add the full amount if over 5 mins
      }
    });
    // --- [END OF NEW LATE MINS LOGIC] ---

    const Late_hours = Number((lateMinsTotal / 60).toFixed(2));

    // --- OT Calculation Logic ---
    let AdditionalOT = 0;
    let OT_hours = 0;
    let totalOTMinutes = 0;
    let customTimingOTMinutes = 0; // Track custom timing OT separately for display

    const grant = getGrantForEmployee(employee);
    // Note: customTiming was already fetched above for late mins

    const parseMinutes = (val?: string | number | null): number => {
      if (!val) return 0;
      const str = String(val).trim();

      // Handle time format "HH:MM"
      if (str.includes(":")) {
        const [h, m] = str.split(":").map((x) => parseInt(x) || 0);
        return h * 60 + m;
      }

      // Handle decimal hours (e.g., "8.5" = 8h 30m)
      const decimalHours = parseFloat(str);
      if (!isNaN(decimalHours)) {
        return Math.round(decimalHours * 60);
      }

      return 0;
    };

    // Helper to calculate custom timing OT for a day
    const calculateCustomTimingOT = (
      outTime: string,
      expectedEndMinutes: number
    ): number => {
      if (!outTime || outTime === "-") return 0;

      // Use the helper function
      const outMinutes = timeToMinutes(outTime);

      const otMinutes =
        outMinutes > expectedEndMinutes ? outMinutes - expectedEndMinutes : 0;

      // Ignore minor deviations (less than 5 minutes)
      return otMinutes < 5 ? 0 : otMinutes;
    };

    if (grant) {
      // ✅ Employee IS in Staff OT Granted: Count all days in range
      const fromD = Number(grant.fromDate) || 1;
      const toD = Number(grant.toDate) || 31;

      console.log(
        `📅 OT Date Range for ${employee.empName}: ${fromD} to ${toD}`
      );

      let daysInRange = 0;
      employee.days?.forEach((day) => {
        const dateNum = Number(day.date) || 0;
        if (dateNum >= fromD && dateNum <= toD) {
          daysInRange++;
          const status = (day.attendance.status || "").toUpperCase();

          let dayOTMinutes = 0;

          // Check if this employee has custom timing
          if (customTiming) {
            // Calculate OT based on custom timing
            dayOTMinutes = calculateCustomTimingOT(
              day.attendance.outTime,
              customTiming.expectedEndMinutes
            );
            if (dayOTMinutes > 0) {
              customTimingOTMinutes += dayOTMinutes;
              console.log(
                `  Day ${dateNum} (${day.day}, ${status}): Custom timing OT = ${dayOTMinutes}min (Out: ${day.attendance.outTime})`
              );
            }
          } else {
            // Use standard OT from attendance
            const otField =
              (day.attendance as any).otHours ??
              (day.attendance as any).otHrs ??
              (day.attendance as any).ot ??
              (day.attendance as any).workHrs ??
              (day.attendance as any).workHours ??
              null;

            dayOTMinutes = parseMinutes(otField);
            if (dayOTMinutes > 0) {
              console.log(
                `  Day ${dateNum} (${day.day}, ${status}): Standard OT = ${dayOTMinutes}min`
              );
            }
          }

          // Cap at 9 hours (540 minutes) per day
          const cappedOT = Math.min(dayOTMinutes, 540);
          totalOTMinutes += cappedOT;
        }
      });

      console.log(
        `✅ Counted ${daysInRange} days in OT range for ${employee.empName}`
      );
    } else {
      // 🟨 Employee NOT in Staff OT Granted: Only Saturdays, EXCLUDE ADJ-P
      console.log(
        `📅 Employee ${employee.empName} not in OT Granted - counting Saturdays only (excluding ADJ-P)`
      );

      let saturdayCount = 0;
      employee.days?.forEach((day) => {
        const dayName = (day.day || "").toLowerCase();
        const status = (day.attendance.status || "").toUpperCase();

        // ✅ Only Saturdays AND not ADJ-P
        if (dayName === "sa" && status !== "ADJ-P") {
          saturdayCount++;

          let dayOTMinutes = 0;

          // Check if this employee has custom timing
          if (customTiming) {
            // Calculate OT based on custom timing
            dayOTMinutes = calculateCustomTimingOT(
              day.attendance.outTime,
              customTiming.expectedEndMinutes
            );
            if (dayOTMinutes > 0) {
              customTimingOTMinutes += dayOTMinutes;
              console.log(
                `  Saturday Day ${day.date} (${status}): Custom timing OT = ${dayOTMinutes}min (Out: ${day.attendance.outTime})`
              );
            }
          } else {
            // Use standard OT from attendance
            const otField =
              (day.attendance as any).otHours ??
              (day.attendance as any).otHrs ??
              (day.attendance as any).ot ??
              (day.attendance as any).workHrs ??
              (day.attendance as any).workHours ??
              null;

            dayOTMinutes = parseMinutes(otField);
            if (dayOTMinutes > 0) {
              console.log(
                `  Saturday Day ${day.date} (${status}): Standard OT = ${dayOTMinutes}min`
              );
            }
          }

          // Cap at 9 hours (540 minutes) per day
          const cappedOT = Math.min(dayOTMinutes, 540);
          totalOTMinutes += cappedOT;
        } else if (dayName === "sa" && status === "ADJ-P") {
          // 🚫 Explicitly log excluded Saturdays
          console.log(
            `  ⏭️ EXCLUDED Saturday Day ${day.date} (status: ${status} - ADJ-P not counted)`
          );
        }
      });

      console.log(
        `✅ Counted ${saturdayCount} eligible Saturdays for ${employee.empName} (ADJ-P excluded)`
      );
    }

    // [MODIFIED] Check if employee is 'Worker' and NOT granted OT
    if (isWorker && !grant) {
      console.log(
        `👷 Employee ${employee.empName} is [Worker] and [Not Granted]. Re-calculating OT for all non-ADJ-P days.`
      );
      // Reset totals calculated by Saturday-only logic
      totalOTMinutes = 0;
      customTimingOTMinutes = 0;
      let eligibleDays = 0;

      employee.days?.forEach((day) => {
        const status = (day.attendance.status || "").toUpperCase();

        // ✅ All days EXCEPT ADJ-P
        if (status !== "ADJ-P") {
          eligibleDays++;
          let dayOTMinutes = 0;

          if (customTiming) {
            dayOTMinutes = calculateCustomTimingOT(
              day.attendance.outTime,
              customTiming.expectedEndMinutes
            );
            if (dayOTMinutes > 0) {
              customTimingOTMinutes += dayOTMinutes;
            }
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
          const cappedOT = Math.min(dayOTMinutes, 540);
          totalOTMinutes += cappedOT;
        }
      });
      console.log(
        `✅ Counted ${eligibleDays} eligible days (for 'Worker - Not Granted'): ${totalOTMinutes} min`
      );
    }
    // [END OF WORKER OT MODIFICATION]

    // Add Full Night Stay OT hours (these are always added regardless of day)
    const fullNightOTHours = getFullNightOTForEmployee(employee);
    if (fullNightOTHours > 0) {
      const fullNightMinutes = fullNightOTHours * 60;
      totalOTMinutes += fullNightMinutes;
      console.log(
        `✅ Added ${fullNightOTHours} Full Night OT hours. Minutes now: ${totalOTMinutes}`
      );
    }

    // --- Apply 5% OT Deduction for Maintenance Employees ---
    if (isMaintenanceEmployee(employee)) {
      const originalOTMinutes = totalOTMinutes;
      totalOTMinutes = totalOTMinutes * 0.95; // Apply 5% deduction (1.00 - 0.05)
      wasOTDeducted = true; // Set the flag

      console.log(
        `⬇️ Applied 5% OT deduction for ${
          employee.empName
        } (Maintenance). Original: ${originalOTMinutes.toFixed(
          2
        )} min, Deducted: ${totalOTMinutes.toFixed(2)} min`
      );
    }
    // --- [END OF DEDUCTION LOGIC] ---

    // This line now uses the *potentially deducted* totalOTMinutes
    OT_hours = Number((totalOTMinutes / 60).toFixed(2));
    const customTimingOTHours = Number((customTimingOTMinutes / 60).toFixed(2));

    console.log(
      `⏱️ Total OT for ${employee.empName}: ${OT_hours} hours (${totalOTMinutes} minutes)`
    );
    if (customTimingOTHours > 0) {
      console.log(
        `  └─ Custom Timing OT portion: ${customTimingOTHours} hours`
      );
    }

    // Apply deduction if Late > OT
    if (totalOTMinutes < lateMinsTotal) {
      const diffInHours = (lateMinsTotal - totalOTMinutes) / 60;
      if (OT_hours < 4) {
        // [NEW] if OT < 4 hours
        AdditionalOT = 0.5; // 0.5 day deduction
        console.log(
          `⚠️ Late (${Late_hours}h) > OT (${OT_hours}h) AND OT < 4h. Applying 0.5 day deduction.`
        );
      } else {
        // Use original 4-hour block logic
        AdditionalOT = 0.5 * Math.floor(diffInHours / 4);
        console.log(
          `⚠️ Late (${Late_hours}h) > OT (${OT_hours}h). Applying ${AdditionalOT} day deduction based on 4-hour blocks.`
        );
      }
    }

    const ATotal = Math.max(Total - AdditionalOT, 0);
    const pl = getPL(employee) || 0;
    const GrandTotal = Math.max(ATotal + pl, 0);

    return {
      PD_excel,
      PAA: Number(PAA.toFixed(1)),
      H_base,
      Total: Number(Total.toFixed(1)),
      Late_hours,
      OT_hours,
      AdditionalOT: Number(AdditionalOT.toFixed(1)), // <-- This is the value
      ATotal: Number(ATotal.toFixed(1)),
      PL_days: pl,
      GrandTotal: Number(GrandTotal.toFixed(1)),
      paCount,
      adjPresentDays,
      fullNightOTHours,
      customTimingOTHours, // This is now part of OT_hours, not separate
      wasOTDeducted, // Return the flag
    };
  }, [
    employee,
    baseHolidaysCount,
    selectedHolidaysCount,
    getPL,
    getGrantForEmployee,
    getFullNightOTForEmployee,
    getCustomTimingForEmployee,
    isMaintenanceEmployee, // Add dependency
  ]);

  // Tooltip definitions
  const tooltipTexts: any = {
    // ... (existing code, no changes)
    PD_excel: "Present days counted directly from attendance sheet.",
    PAA: "Present days after adjustment: Full Present days + ADJ-P days + (P/A days × 0.5).",
    H_base: "Holidays selected from Holiday Management.",
    Total: "Present After Adj + Holidays",
    AdditionalOT:
      "Deduction (in days) applied when Late Hours > Final OT. If Final OT < 4 hrs, deduction is 0.5 days. Otherwise, 0.5 days per 4-hour block.",
    ATotal: "Adjusted total considering OT deduction rules.",
    PL_days: "Paid Leave taken from Staff Paid Leave Sheet.",
    GrandTotal: "A Total + Paid Leave",
  };

  const StatBox = ({ label, value, bgColor, textColor, tooltipKey }: any) => (
    // ... (existing code, no changes)
    <div
      className={`relative text-center p-2 w-[130px] ${bgColor} rounded-md border ${textColor} transition-all hover:shadow`}
    >
      <div className="absolute top-1 right-1">
        <button
          onClick={() =>
            setTooltips((p) => ({ ...p, [tooltipKey]: !p[tooltipKey] }))
          }
          className="w-4 h-4 bg-gray-400 hover:bg-gray-600 text-white rounded-full text-[10px]"
        >
          ?
        </button>
        {tooltips[tooltipKey] && (
          <div className="absolute top-full right-0 mt-2 w-56 bg-gray-900 text-white p-2 rounded shadow-lg z-50 text-xs">
            {tooltipTexts[tooltipKey]}
          </div>
        )}
      </div>

      <div className="text-[11px] text-gray-600">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
        <span className="text-indigo-600">📊</span>
        Present Day Calculation
      </h4>
      <div className="mb-3 text-xs text-gray-700 bg-blue-50 p-3 rounded border border-blue-200">
        <div className="font-semibold mb-2 text-blue-800">
          ⏱️ Time Tracking Details:
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white p-2 rounded border border-blue-100">
            <span className="text-gray-600">Late Hours:</span>
            <span className="ml-2 font-bold text-red-600">
              {stats.Late_hours} hrs
            </span>
          </div>
          <div className="bg-white p-2 rounded border border-blue-100">
            <span className="text-gray-600">OT Hours:</span>
            <span className="ml-2 font-bold text-green-600">
              {stats.OT_hours} hrs
              {stats.wasOTDeducted && <span className="text-red-500">*</span>}
            </span>
          </div>
          <div className="bg-white p-2 rounded border border-orange-100">
            <span className="text-gray-600">Full Night OT:</span>
            <span className="ml-2 font-bold text-orange-600">
              {stats.fullNightOTHours} hrs
            </span>
          </div>
          <div className="bg-white p-2 rounded border border-purple-100">
            <span className="text-gray-600">Custom Timing OT:</span>
            <span className="ml-2 font-bold text-purple-600">
              {stats.customTimingOTHours} hrs
            </span>
          </div>
        </div>
        {stats.customTimingOTHours > 0 && (
          <div className="mt-2 text-xs text-purple-700 italic">
            * Custom Timing OT is included in the OT Hours total above
          </div>
        )}
        {/* This is the new message */}
        {stats.wasOTDeducted && (
          <div className="mt-2 text-xs text-red-700 italic">
            * 5% OT deduction applied (Maintenance)
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <StatBox
          label="PD (Excel)"
          value={stats.PD_excel}
          bgColor="bg-green-50"
          textColor="text-green-700"
          tooltipKey="PD_excel"
        />
        <StatBox
          label="Present After Adj"
          value={stats.PAA}
          bgColor="bg-teal-50"
          textColor="text-teal-700"
          tooltipKey="PAA"
        />
        <StatBox
          label="Holidays (Base)"
          value={stats.H_base}
          bgColor="bg-blue-50"
          textColor="text-blue-700"
          tooltipKey="H_base"
        />
        <StatBox
          label="Total"
          value={stats.Total}
          bgColor="bg-indigo-50"
          textColor="text-indigo-700"
          tooltipKey="Total"
        />

        {/* [NEW] This is the StatBox you requested */}
        <StatBox
          label="Late Deduction"
          value={stats.AdditionalOT}
          bgColor="bg-red-50"
          textColor="text-red-7AF"
          tooltipKey="AdditionalOT"
        />

        <StatBox
          label="A Total"
          value={stats.ATotal}
          bgColor="bg-purple-50"
          textColor="text-purple-700"
          tooltipKey="ATotal"
        />
        <StatBox
          label="Paid Leave"
          value={stats.PL_days}
          bgColor="bg-orange-50"
          textColor="text-orange-700"
          tooltipKey="PL_days"
        />
        <StatBox
          label="Grand Total"
          value={stats.GrandTotal}
          bgColor="bg-emerald-50"
          textColor="text-emerald-700"
          tooltipKey="GrandTotal"
        />
      </div>
    </div>
  );
};
