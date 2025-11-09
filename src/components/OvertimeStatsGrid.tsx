"use client";

import React, { useMemo, useState } from "react";
import { EmployeeData } from "@/lib/types";
import { useExcel } from "@/context/ExcelContext"; // Reverted to original alias path

// Utility helpers
const canon = (s: string) => (s ?? "").toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");
const nameKey = (s: string) => stripNonAlnum(s);

// [NEW] Helper to check if employee is Staff or Worker
const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ''} ${emp.department ?? ''}`.toLowerCase();
  if (inStr.includes('worker')) return false;
  if (inStr.includes('staff')) return true;
  // default to staff if not clear
  return true;
};

// ---- Paid Leave Lookup Hook ---- //
function usePaidLeaveLookup() {
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

    console.log(
      "✅ Maintenance OT Deduct file detected:",
      deductFile.fileName
    );

    // 2. Extract employee data from the file
    // Assumes the file processor populates 'data.employees'
    let maintenanceEmployees: any[] = [];
    if (deductFile.data?.employees && Array.isArray(deductFile.data.employees)) {
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
  employee: EmployeeData;
}

// Moved helper function outside component
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + (minutes || 0);
};

// [NEW] Helper to convert minutes to HH:MM string
const minutesToHHMM = (totalMinutes: number): string => {
  if (isNaN(totalMinutes) || totalMinutes <= 0) return "0:00"; // Return 0:00 if no minutes
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60); // Round to nearest minute
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
};

export const OvertimeStatsGrid: React.FC<Props> = ({
  employee,
}) => {
  const [tooltips, setTooltips] = useState<{ [k: string]: boolean }>({});
  const { getGrantForEmployee } = useStaffOTGrantedLookup();
  const { getFullNightOTForEmployee } = useFullNightOTLookup();
  const { getCustomTimingForEmployee } = useCustomTimingLookup();
  const { isMaintenanceEmployee } = useMaintenanceDeductLookup();

  const stats = useMemo(() => {
    
    // --- [NEW] Recalculate Late Mins Total with Grace Period ---
    const customTiming = getCustomTimingForEmployee(employee);
    let lateMinsTotal = 0;
    let wasOTDeducted = false; // <-- Flag for 5% deduction

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
      } else if (status === "P" || status === "ADJ-P") {
        // FULL DAY: Check against their normal start time (8:30 or custom)
        if (inMinutes > employeeNormalStartMinutes) {
          dailyLateMins = inMinutes - employeeNormalStartMinutes;
        }
      }
      // For any other status (A, H, WO), do nothing.

      // [NEW] Apply the 5-minute grace period
      if (dailyLateMins > PERMISSIBLE_LATE_MINS) {
        lateMinsTotal += dailyLateMins; // Add the full amount if over 5 mins
      }
    });
    // --- [END OF NEW LATE MINS LOGIC] ---

    // const Late_hours = Number((lateMinsTotal / 60).toFixed(2)); // OLD

    // --- OT Calculation Logic ---
    let AdditionalOT = 0;
    // let OT_hours = 0; // Not needed
    let totalOTMinutes = 0;
    let customTimingOTMinutes = 0; // Track custom timing OT separately for display

    const baseOTValue = employee.totalOTHours || "0:00"; // Keep as string

    const grant = getGrantForEmployee(employee);
    const isStaff = getIsStaff(employee); // [NEW] Check if staff
    const isWorker = !isStaff;          // [NEW] Check if worker

    // Note: customTiming was already fetched above for late mins

    const parseMinutes = (val?: string | number | null): number => {
      if (!val) return 0;
      const str = String(val).trim();

      // Handle time format "HH:MM"
      if (str.includes(":")) {
        return timeToMinutes(str); // Use the robust helper
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

    // [NEW] Calculate "OT Without Grant" based on Staff vs Worker status
    let otWithoutGrantInMinutes = 0;

    if (!grant) {
      // --- NO OT GRANT ---
      // Logic depends on whether employee is Staff or Worker
      if (isStaff) {
        // --- [STAFF - NOT GRANTED] ---
        // This is the original Saturday-only logic
        console.log(
          `🏭 Employee ${employee.empName} is [Staff] and [Not Granted]. Calculating Saturday-only OT.`
        );
        let saturdayCount = 0;
        employee.days?.forEach((day) => {
          const dayName = (day.day || "").toLowerCase();
          const status = (day.attendance.status || "").toUpperCase();

          // ✅ Only Saturdays AND not ADJ-P
          if (dayName === "sa" && status !== "ADJ-P") {
            saturdayCount++;
            let dayOTMinutes = 0;

            if (customTiming) {
              dayOTMinutes = calculateCustomTimingOT(
                day.attendance.outTime,
                customTiming.expectedEndMinutes
              );
              if (dayOTMinutes > 0) {
                // We are in the !grant block, so no need to check !grant again
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
            otWithoutGrantInMinutes += cappedOT;
          }
        });
        console.log(
          `✅ Counted ${saturdayCount} eligible Saturdays (for 'Staff - Not Granted'): ${otWithoutGrantInMinutes} min`
        );
      } else {
        // --- [WORKER - NOT GRANTED] ---
        // This is the NEW "all days except ADJ-P" logic as requested
        console.log(
          `👷 Employee ${employee.empName} is [Worker] and [Not Granted]. Calculating OT for all non-ADJ-P days.`
        );
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
            otWithoutGrantInMinutes += cappedOT;
          }
        });
        console.log(
          `✅ Counted ${eligibleDays} eligible days (for 'Worker - Not Granted'): ${otWithoutGrantInMinutes} min`
        );
      }
    }
    // --- [END OF "NOT GRANTED" LOGIC] ---

    
    let otWithGrantInMinutes = 0;
    if (grant) {
      // ✅ Employee IS in Staff OT Granted: Recalculate totalOTMinutes from scratch
      console.log(
        `📅 Employee ${employee.empName} IS in OT Granted list. Recalculating OT for all days in range.`
      );
      // totalOTMinutes = 0; // Reset
      customTimingOTMinutes = 0; // Reset
      
      const fromD = Number(grant.fromDate) || 1;
      const toD = Number(grant.toDate) || 31;
      let daysInRange = 0;

      employee.days?.forEach((day) => {
        const dateNum = Number(day.date) || 0;
        if (dateNum >= fromD && dateNum <= toD) {
          daysInRange++;
          const status = (day.attendance.status || "").toUpperCase();
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
          otWithGrantInMinutes += cappedOT; // [MODIFIED] Use dedicated variable
        }
      });
      console.log(
        `✅ Counted ${daysInRange} days in OT range. Total: ${otWithGrantInMinutes} min`
      );
    } 

    // [NEW] Logic to populate the four new buckets
    const staffOTNotGranted = (grant || !isStaff) ? 0 : otWithoutGrantInMinutes;
    const workerOTNotGranted = (grant || !isWorker) ? 0 : otWithoutGrantInMinutes;
    const staffOTGranted = (!grant || !isStaff) ? 0 : otWithGrantInMinutes;
    const workerOTGranted = (!grant || !isWorker) ? 0 : otWithGrantInMinutes;

    // This is the "Staff OT" that carries forward: either the granted total or the not-granted total
    const staffOTInMinutes = grant ? otWithGrantInMinutes : otWithoutGrantInMinutes;
    
    totalOTMinutes = staffOTInMinutes; // Start with the correct staff/worker OT

    // Add Full Night Stay OT hours (these are always added regardless of day)
    const fullNightOTDecimalHours = getFullNightOTForEmployee(employee); // This is decimal
    const fullNightOTInMinutes = Math.round(fullNightOTDecimalHours * 60);

    if (fullNightOTInMinutes > 0) {
      totalOTMinutes += fullNightOTInMinutes;
      console.log(
        `✅ Added ${minutesToHHMM(fullNightOTInMinutes)} Full Night OT hours. Minutes now: ${totalOTMinutes}`
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

    const finalCalculatedOTInMinutes = totalOTMinutes;
    // const customTimingOTHours = Number((customTimingOTMinutes / 60).toFixed(2)); // OLD

    console.log(
      `⏱️ Total OT for ${employee.empName}: ${minutesToHHMM(finalCalculatedOTInMinutes)} hours (${finalCalculatedOTInMinutes} minutes)`
    );
    if (customTimingOTMinutes > 0) {
      console.log(
        ` 	 └─ Custom Timing OT portion: ${minutesToHHMM(customTimingOTMinutes)} hours`
      );
    }

    // [MODIFIED] New Late Deduction Logic
    if (totalOTMinutes < lateMinsTotal) { // if OT < Late
        const totalOTInHours = totalOTMinutes / 60;
        if (totalOTInHours < 4) { // if OT < 4 hours
            AdditionalOT = 0.5; // 0.5 day deduction
            console.log(
              `⚠️ Late (${minutesToHHMM(lateMinsTotal)}h) > OT (${minutesToHHMM(totalOTMinutes)}h) AND OT < 4h. Applying 0.5 day deduction.`
            );
        } else {
            // Use original 4-hour block logic
            const diffInHours = (lateMinsTotal - totalOTMinutes) / 60;
            AdditionalOT = 0.5 * Math.floor(diffInHours / 4);
             console.log(
              `⚠️ Late (${minutesToHHMM(lateMinsTotal)}h) > OT (${minutesToHHMM(totalOTMinutes)}h). Applying ${AdditionalOT} day deduction based on 4-hour blocks.`
            );
        }
    }

    return {
      baseOTValue, 
      otWithoutGrantInMinutes: Math.round(otWithoutGrantInMinutes), // [DEPRECATED but used by new vars]
      staffOTInMinutes: Math.round(staffOTInMinutes), // [DEPRECATED but used by new vars]
      
      // [NEW] Returning all 4 buckets
      staffOTNotGranted: Math.round(staffOTNotGranted),
      workerOTNotGranted: Math.round(workerOTNotGranted),
      staffOTGranted: Math.round(staffOTGranted),
      workerOTGranted: Math.round(workerOTGranted),

      Late_hours_in_minutes: Math.round(lateMinsTotal), 
      finalCalculatedOTInMinutes: Math.round(totalOTMinutes), 
      AdditionalOT: Number(AdditionalOT.toFixed(1)), 
      fullNightOTInMinutes: Math.round(fullNightOTInMinutes),
      customTimingOTInMinutes: Math.round(customTimingOTMinutes),
      wasOTDeducted, 
    };
  }, [
    employee,
    getGrantForEmployee,
    getFullNightOTForEmployee,
    getCustomTimingForEmployee,
    isMaintenanceEmployee, // Add dependency
  ]);

  // Tooltip definitions
  const tooltipTexts: any = {
    baseOTValue: "The raw 'OT Hours' total from the main Tulsi attendance sheet (HH:MM format).",
    staffOTNotGranted: "Staff (Not Granted): OT calculated *only* from non-ADJ-P Saturdays. Applies only to 'Staff' employees not on the 'Staff OT Granted' list.",
    workerOTNotGranted: "Worker (Not Granted): OT calculated from *all days except ADJ-P*. Applies only to 'Worker' employees not on the 'Staff OT Granted' list.",
    staffOTGranted: "Staff (Granted): OT calculated for all days in the 'Staff OT Granted' period. Applies only to 'Staff' employees.",
    workerOTGranted: "Worker (Granted): OT calculated for all days in the 'Staff OT Granted' period. Applies only to 'Worker' employees.",
    Late_hours_in_minutes: "Total chargeable late minutes (over 5 min grace) converted to hours.",
    finalCalculatedOTInMinutes: "Final calculated OT = (Correct Granted/Not-Granted OT + Full Night OT) - (5% Maintenance Deduction, if applicable).",
    AdditionalOT: "Deduction (in days) applied when Late Hours > Final OT. If Final OT < 4 hrs, deduction is 0.5 days. Otherwise, 0.5 days per 4-hour difference.", // [MODIFIED]
    fullNightOTInMinutes: "Total OT hours from 'Full Night Stay' sheet.",
    customTimingOTInMinutes: "Portion of OT calculated from custom timing (e.g., 9:00 to 6:00).",
  };

  const StatBox = ({ label, value, bgColor, textColor, tooltipKey }: any) => {
    
    let displayValue = value;
    let suffix = '';

    if (tooltipKey === 'AdditionalOT') {
      suffix = ' days';
      displayValue = value.toFixed(1);
    } else if (tooltipKey === 'baseOTValue') {
      suffix = ''; // No suffix for the raw "17:24" string
      displayValue = value;
    } else if (
      tooltipKey === 'Late_hours_in_minutes' ||
      tooltipKey === 'finalCalculatedOTInMinutes' ||
      tooltipKey === 'fullNightOTInMinutes' ||
      tooltipKey === 'customTimingOTInMinutes' ||
      tooltipKey === 'staffOTInMinutes' || // This key is no longer used for a card, but keep for safety
      tooltipKey === 'otWithoutGrantInMinutes' || // This key is no longer used for a card
      tooltipKey === 'staffOTNotGranted' ||
      tooltipKey === 'workerOTNotGranted' ||
      tooltipKey === 'staffOTGranted' ||
      tooltipKey === 'workerOTGranted'
    ) {
      suffix = ''; // The HH:MM format is the value
      displayValue = minutesToHHMM(value); // Convert minutes to HH:MM
    }

    return (
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
        <div className="text-xl font-bold mt-1">
          {displayValue}
          {suffix}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
        <span className="text-indigo-600">⏱️</span>
        Overtime (OT) Calculation
      </h4>

      <div className="mb-3 text-xs text-gray-700 bg-blue-50 p-3 rounded border border-blue-200">
        <div className="font-semibold mb-2 text-blue-800">
          ⚙️ OT Calculation Details:
        </div>
        <div className="flex flex-wrap gap-2">
            <StatBox
              label="Base OT (from Excel)"
              value={stats.baseOTValue} 
              bgColor="bg-gray-50"
              textColor="text-gray-700"
              tooltipKey="baseOTValue"
            />
            <StatBox
              label="Staff OT (Not Granted)"
              value={stats.staffOTNotGranted}
              bgColor="bg-orange-50"
              textColor="text-orange-700"
              tooltipKey="staffOTNotGranted"
            />
            <StatBox
              label="Worker OT (Not Granted)"
              value={stats.workerOTNotGranted}
              bgColor="bg-orange-50"
              textColor="text-orange-700"
              tooltipKey="workerOTNotGranted"
            />
            <StatBox
              label="Staff OT (Granted)"
              value={stats.staffOTGranted}
              bgColor="bg-blue-50"
              textColor="text-blue-700"
              tooltipKey="staffOTGranted"
            />
            <StatBox
              label="Worker OT (Granted)"
              value={stats.workerOTGranted}
              bgColor="bg-blue-50"
              textColor="text-blue-700"
              tooltipKey="workerOTGranted"
            />
            <StatBox
              label="Full Night OT"
              value={stats.fullNightOTInMinutes}
              bgColor="bg-indigo-50"
              textColor="text-indigo-700"
              tooltipKey="fullNightOTInMinutes"
            />
            
            <StatBox
              label="Late Deduction (Days)"
              value={stats.AdditionalOT}
              bgColor="bg-amber-50"
              textColor="text-amber-700"
              tooltipKey="AdditionalOT"
            />
            <StatBox
              label="Final OT"
              value={stats.finalCalculatedOTInMinutes}
              bgColor="bg-green-50"
              textColor="text-green-700"
              tooltipKey="finalCalculatedOTInMinutes"
            />
            
        </div>
        
        {stats.customTimingOTInMinutes > 0 && (
          <div className="mt-2 text-xs text-purple-700 italic">
            * Custom Timing OT is included in the Final OT total above
          </div>
        )}
        {stats.wasOTDeducted && (
          <div className="mt-2 text-xs text-red-700 italic">
            * 5% OT deduction applied to Final OT (Maintenance)
          </div>
        )}
      </div>
    </div>
  );
};