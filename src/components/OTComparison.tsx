"use client";

import React, { useMemo, useState, useCallback } from "react";
import { useExcel } from "@/context/ExcelContext";
import { EmployeeData } from "@/lib/types";
import {
  exportOTComparisonToExcel,
  OTComparisonData,
} from "@/lib/exportComparison";
import { useHROTLookup } from "@/hooks/useHROTLookup";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp } from "lucide-react"; // Import icons
import { useGrandOT } from "@/context/GrandOTContext";
import { useFinalDifference } from "@/context/FinalDifferenceContext";

// Define the type for the sorting state
type SortColumn = keyof OTComparisonData | "difference" | "category";
type SortDirection = "asc" | "desc";

// Define the Difference Category type
type DifferenceCategory = "N/A" | "Match" | "Minor" | "Medium" | "Major";

// Extend OTComparisonData type locally to include category for sorting and coloring
interface SortableOTComparisonData extends OTComparisonData {
  category: DifferenceCategory;
  company: string;
}

/**
 * ===========================
 * HELPER FUNCTIONS
 * ===========================
 */

/**
 * Determines the category of the difference and returns a numeric sort value.
 * Category definition:
 * - Major: |Diff| > 2
 * - Medium: 1 < |Diff| <= 2
 * - Minor: 0 < |Diff| <= 1
 * - Match: Diff = 0
 */
const getDifferenceCategory = (
  diff: number | string
): { category: DifferenceCategory; sortValue: number } => {
  if (diff === "N/A") {
    // Treat N/A as lowest priority (e.g., sortValue 0)
    return { category: "N/A", sortValue: 0 };
  }
  const absDiff = Math.abs(diff as number);

  if (absDiff === 0) {
    // Treat Match as highest priority (e.g., sortValue 5)
    return { category: "Match", sortValue: 5 };
  } else if (absDiff > 2) {
    // Major (e.g., sortValue 4)
    return { category: "Major", sortValue: 4 };
  } else if (absDiff > 1) {
    // Medium (e.g., sortValue 3)
    return { category: "Medium", sortValue: 3 };
  } else {
    // Minor (e.g., sortValue 2)
    return { category: "Minor", sortValue: 2 };
  }
};

// Add this after other handler functions (around line 400)
const handleScrollToEmployee = (empCode: string) => {
  const element = document.getElementById(`employee-${empCode}`);
  if (element) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    // Optional: Add a highlight effect
    element.classList.add("ring-4", "ring-blue-400");
    setTimeout(() => {
      element.classList.remove("ring-4", "ring-blue-400");
    }, 2000);
  }
};

/**
 * Convert "HH:MM" time strings to total minutes.
 */
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return (hours || 0) * 60 + (minutes || 0);
};

/**
 * Convert minutes to HH:MM string (Not strictly needed for comparison, but kept)
 */
const minutesToHHMM = (totalMinutes: number): string => {
  if (isNaN(totalMinutes) || totalMinutes <= 0) return "0:00";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

/**
 * Check if employee is Staff or Worker
 */
const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${emp.department ?? ""
    }`.toLowerCase();
  if (inStr.includes("c cash")) return false;
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  return true; // default to staff
};

/**
 * ===========================
 * CUSTOM HOOKS (Kept unchanged)
 * ===========================
 */

/**
 * Hook to get Staff OT Granted info
 */
function useStaffOTGrantedLookup() {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
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

    let otEmployees: any[] = [];
    if (staffOTFile.otGrantedData && Array.isArray(staffOTFile.otGrantedData)) {
      otEmployees = staffOTFile.otGrantedData;
    } else if (
      staffOTFile.data?.employees &&
      Array.isArray(staffOTFile.data.employees)
    ) {
      otEmployees = staffOTFile.data.employees;
    }

    const norm = (s: string) => (s ?? "").toString().toUpperCase().trim();
    const key = (s: string) => norm(s).replace(/[^A-Z0-9]/g, "");
    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";

    const byCode = new Map<string, any>();
    const byName = new Map<string, any>();

    for (const emp of otEmployees) {
      if (emp.empCode) {
        const codeKey = key(emp.empCode);
        const numKey = numOnly(emp.empCode);
        byCode.set(codeKey, emp);
        if (numKey) byCode.set(numKey, emp);
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

      let found = byCode.get(empCodeK);
      if (!found && numCodeK) found = byCode.get(numCodeK);
      if (!found) found = byName.get(empNameK);

      return found;
    };

    return { getGrantForEmployee };
  }, [getAllUploadedFiles]);
}

/**
 * Hook to get Full Night OT
 */
function useFullNightOTLookup() {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
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

    // console.log("✅ Full Night Stay OT file detected:", fullNightFile.fileName);

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

        const current = employeeByCode.get(codeKey) || 0;
        employeeByCode.set(codeKey, current + hours);

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

      let totalHours = employeeByCode.get(empCodeK);
      if (totalHours === undefined && numCodeK) {
        totalHours = employeeByCode.get(numCodeK);
      }
      if (totalHours === undefined) {
        totalHours = employeeByName.get(empNameK);
      }

      return totalHours || 0;
    };

    return { getFullNightOTForEmployee };
  }, [getAllUploadedFiles]);
}

/**
 * Hook to get Custom Timing info (09 to 06)
 */
function useCustomTimingLookup() {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
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

    // console.log(
    //   "✅ 09 to 06 Time Granted file detected:",
    //   customTimingFile.fileName
    // );

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

      let found = employeeByCode.get(empCodeK);
      if (!found && numCodeK) found = employeeByCode.get(numCodeK);
      if (!found) found = employeeByName.get(empNameK);

      if (!found || !found.customTime) return null;

      const timeStr = found.customTime;
      const match = timeStr.match(
        /(\d{1,2}):(\d{2})\s*TO\s*(\d{1,2}):(\d{2})/i
      );

      if (match) {
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
 * Hook to check Maintenance OT Deduct
 */
function useMaintenanceDeductLookup() {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
    const deductFile = files.find((f: any) => {
      const n = (f?.fileName || "").toString().toLowerCase();
      return (
        f.status === "success" &&
        n.includes("maintenance") &&
        n.includes("deduct")
      );
    });

    if (!deductFile) {
      return { isMaintenanceEmployee: () => false };
    }

    // console.log(
    //   "✅ Maintenance OT Deduct file detected:",
    //   deductFile.fileName
    // );

    let maintenanceEmployees: any[] = [];
    if (
      deductFile.data?.employees &&
      Array.isArray(deductFile.data.employees)
    ) {
      maintenanceEmployees = deductFile.data.employees;
    } else {
      // console.warn(
      //   "⚠️ Maintenance deduct file found, but no 'data.employees' array inside."
      // );
      return { isMaintenanceEmployee: () => false };
    }

    const norm = (s: string) => (s ?? "").toString().toUpperCase().trim();
    const key = (s: string) => norm(s).replace(/[^A-Z0-9]/g, "");
    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";

    const employeeCodeSet = new Set<string>();
    const employeeNameSet = new Set<string>();

    for (const emp of maintenanceEmployees) {
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

/**
 * ===========================
 * FINAL OT CALCULATION (Unchanged)
 * ===========================
 */
// ---- REPLACE the existing calculateFinalOT with this implementation ----
function calculateFinalOT(
  employee: EmployeeData,
  getGrantForEmployee: any,
  getFullNightOTForEmployee: any,
  getCustomTimingForEmployee: any,
  isMaintenanceEmployee: any
): number {
  // Reuse helpers already defined in this file:
  // - timeToMinutes
  // - minutesToHHMM (not needed here but exists)
  // - getIsStaff
  const isStaff = getIsStaff(employee);
  const grant = getGrantForEmployee(employee);
  const customTiming = getCustomTimingForEmployee(employee);

  // Parse OT fields which may be "HH:MM" or decimal hours
  const parseMinutes = (val?: string | number | null): number => {
    if (!val) return 0;
    const str = String(val).trim();
    if (str.includes(":")) return timeToMinutes(str);
    const dec = parseFloat(str);
    return isNaN(dec) ? 0 : Math.round(dec * 60);
  };

  const calculateCustomTimingOT = (
    outTime: string,
    expectedEndMinutes: number
  ): number => {
    if (!outTime || outTime === "-") return 0;
    const outMin = timeToMinutes(outTime);
    const ot = outMin > expectedEndMinutes ? outMin - expectedEndMinutes : 0;
    return ot < 5 ? 0 : ot;
  };

  // Timing constants (matches OvertimeStatsGrid)
  const STANDARD_START_MINUTES = 8 * 60 + 30;
  const EVENING_SHIFT_START_MINUTES = 13 * 60 + 15;
  const MORNING_EVENING_CUTOFF_MINUTES = 10 * 60;
  const PERMISSIBLE_LATE_MINS = 5;

  // ADJ-P cutoff: shift end (17:30) + 30 mins buffer -> 18:00 (1080)
  const ADJ_P_BUFFER_MINUTES = 30;
  const ADJ_P_SHIFT_END_MINUTES = 17 * 60 + 30;
  const ADJ_P_CUTOFF_MINUTES = ADJ_P_SHIFT_END_MINUTES + ADJ_P_BUFFER_MINUTES;

  // 1) Calculate Late minutes total (same rules as stats grid)
  let lateMinsTotal = 0;
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

  // 2) Compute OT minutes depending on whether employee is in the "grant" sheet
  let grantedFromSheetStaffMinutes = 0;
  let staffGrantedOTMinutes = 0; // Saturdays/Holidays for staff not in grant sheet
  let staffNonGrantedOTMinutes = 0; // Working days for staff not in grant sheet
  let workerGrantedOTMinutes = 0;
  let worker9to6OTMinutes = 0;

  // Helper to get OT field fallback
  const getOtFieldMinutes = (attendanceObj: any) => {
    const otField =
      attendanceObj.otHours ??
      attendanceObj.otHrs ??
      attendanceObj.ot ??
      attendanceObj.workHrs ??
      attendanceObj.workHours ??
      null;
    return parseMinutes(otField);
  };

  if (grant) {
    // If in granted sheet, OT counted only for days within grant.fromDate..grant.toDate
    const fromD = Number(grant.fromDate) || 1;
    const toD = Number(grant.toDate) || 31;
    employee.days?.forEach((day) => {
      const dateNum = Number(day.date) || 0;
      if (dateNum < fromD || dateNum > toD) return;

      const status = (day.attendance.status || "").toUpperCase();
      const outTime = day.attendance.outTime;
      let dayOTMinutes = 0;

      if (customTiming) {
        dayOTMinutes = calculateCustomTimingOT(
          outTime,
          customTiming.expectedEndMinutes
        );
      } else if (status === "ADJ-P") {
        // ADJ-P → ignore raw OT field; count OT only after ADJ_P_CUTOFF_MINUTES
        if (outTime && outTime !== "-") {
          const outMin = timeToMinutes(outTime);
          dayOTMinutes =
            outMin > ADJ_P_CUTOFF_MINUTES
              ? outMin - ADJ_P_SHIFT_END_MINUTES
              : 0;
        }
      } else {
        dayOTMinutes = getOtFieldMinutes(day.attendance);
      }

      grantedFromSheetStaffMinutes += dayOTMinutes;
    });
  } else {
    // Not in granted sheet -> different handling for staff and workers
    const isStaff = getIsStaff(employee);
    if (isStaff) {
      // Staff: first, Saturdays / Holidays (and ADJ-P / ADJ-M / WO-I types) => staffGrantedOTMinutes
      employee.days?.forEach((day) => {
        const dayName = (day.day || "").toLowerCase();
        const status = (day.attendance.status || "").toUpperCase();

        if (
          dayName === "sa" ||
          status === "ADJ-P" ||
          status === "WO-I" ||
          status === "ADJ-M"
        ) {
          let dayOTMinutes = 0;
          if (customTiming) {
            dayOTMinutes = calculateCustomTimingOT(
              day.attendance.outTime,
              customTiming.expectedEndMinutes
            );
          } else if (status === "ADJ-P") {
            // ADJ-P uses cutoff + buffer
            const outTime = day.attendance.outTime;
            if (outTime && outTime !== "-") {
              const outMin = timeToMinutes(outTime);
              dayOTMinutes =
                outMin > ADJ_P_CUTOFF_MINUTES
                  ? outMin - ADJ_P_SHIFT_END_MINUTES
                  : 0;
            }
          } else {
            dayOTMinutes = getOtFieldMinutes(day.attendance);
          }
          staffGrantedOTMinutes += dayOTMinutes;
        }
      });

      // Staff Non-Granted: normal working days (exclude SA/ADJ-P/ADJ-M/WO-I)
      employee.days?.forEach((day) => {
        const dayName = (day.day || "").toLowerCase();
        const status = (day.attendance.status || "").toUpperCase();

        if (
          dayName !== "sa" &&
          status !== "ADJ-P" &&
          status !== "ADJ-M" &&
          status !== "WO-I"
        ) {
          let dayOTMinutes = 0;
          if (customTiming) {
            dayOTMinutes = calculateCustomTimingOT(
              day.attendance.outTime,
              customTiming.expectedEndMinutes
            );
          } else {
            dayOTMinutes = getOtFieldMinutes(day.attendance);
          }
          staffNonGrantedOTMinutes += dayOTMinutes;
        }
      });
    } else {
      // Worker (not in granted sheet) -> sum OT for all days with ADJ-P special handling
      employee.days?.forEach((day) => {
        const status = (day.attendance.status || "").toUpperCase();
        const dayName = (day.day || "").toLowerCase();
        let dayOTMinutes = 0;

        if (customTiming) {
          dayOTMinutes = calculateCustomTimingOT(
            day.attendance.outTime,
            customTiming.expectedEndMinutes
          );
          if (dayOTMinutes > 0) worker9to6OTMinutes += dayOTMinutes;
        } else if (status === "ADJ-P") {
          const outTime = day.attendance.outTime;
          if (outTime && outTime !== "-") {
            const outMinutes = timeToMinutes(outTime);
            // For workers we use ADJ_P_CUTOFF_MINUTES as well
            if (outMinutes > ADJ_P_CUTOFF_MINUTES) {
              dayOTMinutes = outMinutes - ADJ_P_SHIFT_END_MINUTES;
            }
          }
        } else {
          dayOTMinutes = getOtFieldMinutes(day.attendance);
        }

        workerGrantedOTMinutes += dayOTMinutes;
      });
    }
  }

  // Determine final OT for deduction and grand total basis
  const isWorker = !getIsStaff(employee);
  const totalFromStaffGrantLogic =
    grantedFromSheetStaffMinutes + staffGrantedOTMinutes;
  let finalOTForDeduction = isStaff
    ? totalFromStaffGrantLogic
    : workerGrantedOTMinutes;

  // Add staffNonGrantedOTMinutes only if needed in your rules; previous stats grid used:
  // totalMinutes = grantedFromSheetStaffMinutes + staffGrantedOTMinutes
  // (so staffNonGrantedOTMinutes does not add into 'total'—we keep same behavior here)

  // Apply maintenance deduction (5%) if applicable
  let wasOTDeducted = false;
  if (isMaintenanceEmployee(employee)) {
    finalOTForDeduction = finalOTForDeduction * 0.95;
    wasOTDeducted = true;
  }

  // Late Deduction removed - set to 0
  const lateDeductionMinutes = 0;

  // Full Night OT
  const fullNightOTDecimal = getFullNightOTForEmployee(employee) || 0;
  const fullNightOTInMinutes = Math.round(fullNightOTDecimal * 60);

  // Grand total logic (same as stats grid):
  // Grand total logic (same as stats grid):
  let grandTotalMinutes = finalOTForDeduction + fullNightOTInMinutes - lateDeductionMinutes;

  // Prevent negative totals
  grandTotalMinutes = Math.max(0, Math.round(grandTotalMinutes));

  return grandTotalMinutes;
}

export const OTComparison: React.FC = () => {
  const { excelData } = useExcel();
  const [showTable, setShowTable] = useState(false);
  const { overtimeGrandTotals } = useFinalDifference();
  const [isLoading, setIsLoading] = useState(false);
  const [filterCompany, setFilterCompany] = useState<string>(
    "INDIANA OPHTHALMICS LLP"
  );
  const companies = [
    "INDIANA OPHTHALMICS LLP",
    "NUTRACEUTICO",
    "SCI PREC",
    "SCI PREC LIFESCIENCES",
  ];

  // New state for filtering
  const [filterCategory, setFilterCategory] = useState<
    DifferenceCategory | "All" | null
  >(null);

  const [sortConfig, setSortConfig] = useState<{
    key: SortColumn;
    direction: SortDirection;
  }>({
    key: "empCode", // Default sort column
    direction: "asc", // Default sort direction
  });

  // Get all lookup hooks
  const { getHROTValue } = useHROTLookup();
  const { getGrantForEmployee } = useStaffOTGrantedLookup();
  const { getFullNightOTForEmployee } = useFullNightOTLookup();
  const { getCustomTimingForEmployee } = useCustomTimingLookup();
  const { isMaintenanceEmployee } = useMaintenanceDeductLookup();

  // 1. Calculate and annotate data with category
  const categorizedData: SortableOTComparisonData[] = useMemo(() => {
    if (!excelData || !excelData.employees || !showTable) return [];
    setIsLoading(true);

    const data: SortableOTComparisonData[] = excelData.employees.map(
      (employee: EmployeeData) => {
        // Try context first:
        const ctxMinutes = overtimeGrandTotals.get(employee.empCode);
        const finalOTMinutes =
          typeof ctxMinutes === "number"
            ? ctxMinutes
            : calculateFinalOT(
              employee,
              getGrantForEmployee,
              getFullNightOTForEmployee,
              getCustomTimingForEmployee,
              isMaintenanceEmployee
            );

        const softwareOTHours: number = Number(
          (finalOTMinutes / 60).toFixed(2)
        );
        const hrOTHours: number | null = getHROTValue(employee);

        const difference: number | string =
          hrOTHours === null
            ? "N/A"
            : Number((softwareOTHours - hrOTHours).toFixed(2));

        const { category } = getDifferenceCategory(difference);

        return {
          empCode: employee.empCode,
          empName: employee.empName,
          company: employee.companyName,
          softwareOTHours,
          hrOTHours,
          difference,
          category,
        };
      }
    );

    setIsLoading(false);
    return data;
  }, [
    excelData,
    showTable,
    overtimeGrandTotals,
    getHROTValue,
    getGrantForEmployee,
    getFullNightOTForEmployee,
    getCustomTimingForEmployee,
    isMaintenanceEmployee,
  ]);

  // 2. Sorting Logic (Updated to handle category sort)
  const sortedData = useMemo(() => {
    if (categorizedData.length === 0) return [];
    const sortableData = [...categorizedData];

    sortableData.sort((a, b) => {
      const { key, direction } = sortConfig;

      let aValue: string | number | null = null;
      let bValue: string | number | null = null;

      if (key === "category") {
        // Sort by Category: Match (5) > Major (4) > Medium (3) > Minor (2) > N/A (0)
        const { sortValue: aSortValue } = getDifferenceCategory(a.difference);
        const { sortValue: bSortValue } = getDifferenceCategory(b.difference);

        return direction === "asc"
          ? aSortValue - bSortValue
          : bSortValue - aSortValue;
      } else if (key === "difference") {
        // Sort by actual difference value
        aValue =
          a.difference === "N/A"
            ? direction === "asc"
              ? Infinity
              : -Infinity
            : (a.difference as number);
        bValue =
          b.difference === "N/A"
            ? direction === "asc"
              ? Infinity
              : -Infinity
            : (b.difference as number);
      } else if (key === "hrOTHours") {
        // Handle null (treated as extremes) for hrOTHours sort
        aValue =
          a.hrOTHours === null
            ? direction === "asc"
              ? Infinity
              : -Infinity
            : a.hrOTHours;
        bValue =
          b.hrOTHours === null
            ? direction === "asc"
              ? Infinity
              : -Infinity
            : b.hrOTHours;
      } else if (
        key === "empCode" ||
        key === "empName" ||
        key === "softwareOTHours"
      ) {
        aValue = a[key];
        bValue = b[key];
      }

      if (aValue === null || bValue === null) return 0;

      if (typeof aValue === "string" && typeof bValue === "string") {
        const comparison = aValue.localeCompare(bValue);
        return direction === "asc" ? comparison : -comparison;
      } else if (typeof aValue === "number" && typeof bValue === "number") {
        return direction === "asc" ? aValue - bValue : bValue - aValue;
      }
      return 0;
    });

    return sortableData;
  }, [categorizedData, sortConfig]);

  // 3. Filtering Logic
  const filteredData = useMemo(() => {
    let data = sortedData;

    // Category filter
    if (filterCategory && filterCategory !== "All") {
      data = data.filter((row) => row.category === filterCategory);
    }

    // Company filter (NEW)
    if (filterCompany !== "All") {
      data = data.filter((row) => row.company === filterCompany);
    }

    return data;
  }, [sortedData, filterCategory, filterCompany]);

  // Handler to change sorting
  const requestSort = useCallback(
    (key: SortColumn) => {
      let direction: SortDirection = "asc";
      if (sortConfig.key === key && sortConfig.direction === "asc") {
        direction = "desc";
      }
      setSortConfig({ key, direction });
    },
    [sortConfig]
  );

  /**
   * Renders both up and down arrows for all columns.
   */
  const getSortArrows = (key: SortColumn) => (
    <div className="flex flex-col ml-1">
      <ArrowUp
        size={10}
        className={
          sortConfig.key === key && sortConfig.direction === "asc"
            ? "text-gray-900"
            : "text-gray-300"
        }
      />
      <ArrowDown
        size={10}
        className={
          sortConfig.key === key && sortConfig.direction === "desc"
            ? "text-gray-900"
            : "text-gray-300"
        }
      />
    </div>
  );

  /**
   * Get CSS class for the Difference cell based on category
   */
  const getDiffClass = (category: DifferenceCategory): string => {
    switch (category) {
      case "Major":
        return "text-red-600 font-extrabold";
      case "Medium":
        return "text-orange-600 font-bold"; // Using orange for visibility
      case "Minor":
        return "text-gray-900 font-medium"; // Default color
      case "Match":
        return "text-green-600 font-semibold";
      case "N/A":
        return "text-gray-400";
      default:
        return "text-gray-700";
    }
  };

  const getCategoryButtonClass = (
    buttonCategory: DifferenceCategory | "All" | null
  ) => {
    const baseClass =
      "px-3 py-1 text-xs font-semibold rounded-full transition-colors";
    if (filterCategory === buttonCategory) {
      switch (buttonCategory) {
        case "Major":
          return `${baseClass} bg-red-600 text-white`;
        case "Medium":
          return `${baseClass} bg-orange-600 text-white`;
        case "Minor":
          return `${baseClass} bg-gray-600 text-white`;
        case "Match":
          return `${baseClass} bg-green-600 text-white`;
        case "N/A":
          return `${baseClass} bg-gray-400 text-white`;
        case "All":
        default:
          return `${baseClass} bg-blue-600 text-white`;
      }
    }
    return `${baseClass} bg-gray-200 text-gray-700 hover:bg-gray-300`;
  };



  const handleExportClick = () => {
    if (categorizedData.length === 0) {
      console.warn("Please click 'Compare' first to generate data.");
      return;
    }
    // Export the data including the calculated category (useful for debugging/analysis)
    const exportData = categorizedData.map(({ category, ...rest }) => ({
      ...rest,
      DifferenceCategory: category,
    }));
    exportOTComparisonToExcel(exportData, "OT_Comparison.xlsx");
  };

  if (!excelData) return null;

  const tableHeaders: { label: string; key: SortColumn }[] = [
    { label: "Emp Code", key: "empCode" },
    { label: "Emp Name", key: "empName" },
    { label: "Software Final OT (Hours)", key: "softwareOTHours" },
    { label: "HR (Tulsi) OT (Hours)", key: "hrOTHours" },
    { label: "Difference", key: "difference" },
  ];

  return (
    <div className="mt-8 pt-6 border-t border-gray-300">
      <div
        className="flex items-center justify-between mb-4 cursor-pointer group select-none"
        onClick={() => setShowTable(!showTable)}
      >
        <h3 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
          Overtime (OT) Comparison
        </h3>
        <button className="p-1 rounded-full hover:bg-gray-100 transition-colors">
          {showTable ? (
            <ChevronUp className="text-gray-600" />
          ) : (
            <ChevronDown className="text-gray-600" />
          )}
        </button>
      </div>

      {showTable && (
        <div className="flex gap-4 mb-4 items-center flex-wrap">
          <div className="px-4 py-2 flex gap-3 items-center">
            <span className="text-sm font-medium text-gray-700">Company:</span>

            <select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              className="px-3 py-1 text-sm border rounded-md bg-white"
            >
              <option value="All">All</option>
              {companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportClick}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            Export OT Comparison
          </button>

          <span className="text-sm font-medium text-gray-700 ml-4">
            Filter by:
          </span>
          <button
            onClick={() => setFilterCategory("All")}
            className={getCategoryButtonClass("All")}
          >
            All ({categorizedData.length})
          </button>
          <button
            onClick={() => setFilterCategory("Major")}
            className={getCategoryButtonClass("Major")}
          >
            Major (
            {categorizedData.filter((row) => row.category === "Major").length})
          </button>
          <button
            onClick={() => setFilterCategory("Medium")}
            className={getCategoryButtonClass("Medium")}
          >
            Medium (
            {categorizedData.filter((row) => row.category === "Medium").length})
          </button>
          <button
            onClick={() => setFilterCategory("Minor")}
            className={getCategoryButtonClass("Minor")}
          >
            Minor (
            {categorizedData.filter((row) => row.category === "Minor").length})
          </button>
          <button
            onClick={() => setFilterCategory("Match")}
            className={getCategoryButtonClass("Match")}
          >
            Match (
            {categorizedData.filter((row) => row.category === "Match").length})
          </button>
          <button
            onClick={() => setFilterCategory("N/A")}
            className={getCategoryButtonClass("N/A")}
          >
            N/A (
            {categorizedData.filter((row) => row.category === "N/A").length})
          </button>
        </div>
      )}

      {showTable && (
        <div className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-600">Loading comparison data...</div>
            </div>
          ) : (
            <>
              {/* Summary Stats (updated to use categorizedData) */}
              <div className="mb-4 p-4 bg-blue-50 rounded-md border border-blue-200">
                <div className="text-sm font-semibold text-blue-800 mb-2">
                  📊 Comparison Summary
                </div>
                <div className="grid grid-cols-5 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Total Employees:</span>{" "}
                    <span className="font-bold">{categorizedData.length}</span>
                  </div>

                  <div>
                    <span className="text-gray-600">Matches:</span>{" "}
                    <span className="font-bold text-green-600">
                      {
                        categorizedData.filter(
                          (row) => row.category === "Match"
                        ).length
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Minor Diff:</span>{" "}
                    <span className="font-bold text-gray-900">
                      {
                        categorizedData.filter(
                          (row) => row.category === "Minor"
                        ).length
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Medium Diff:</span>{" "}
                    <span className="font-bold text-orange-600">
                      {
                        categorizedData.filter(
                          (row) => row.category === "Medium"
                        ).length
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Major Diff:</span>{" "}
                    <span className="font-bold text-red-600">
                      {
                        categorizedData.filter(
                          (row) => row.category === "Major"
                        ).length
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Comparison Table with Sorting and Filtering */}
              <div className="max-h-[600px] overflow-y-auto border border-gray-300 rounded-md">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {tableHeaders.map((header) => (
                        <th
                          key={header.key}
                          onClick={() => requestSort(header.key)}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b-2 border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center">
                            {header.label}
                            {getSortArrows(header.key)}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredData.map((row, index) => {
                      const diffClass = getDiffClass(row.category);
                      const rowBgClass =
                        index % 2 === 0 ? "bg-white" : "bg-gray-50";

                      return (
                        <tr
                          key={`${row.empCode}-${index}`}
                          className={`${rowBgClass} hover:bg-blue-50 transition-colors`}
                        >
                          {/* 🆕 Clickable Emp Code */}
                          <td
                            className="px-4 py-3 whitespace-nowrap text-sm text-blue-600 font-medium cursor-pointer hover:text-blue-800 hover:underline"
                            onClick={() => handleScrollToEmployee(row.empCode)}
                          >
                            {row.empCode}
                          </td>

                          {/* 🆕 Clickable Emp Name */}
                          <td
                            className="px-4 py-3 whitespace-nowrap text-sm text-blue-600 cursor-pointer hover:text-blue-800 hover:underline"
                            onClick={() => handleScrollToEmployee(row.empCode)}
                          >
                            {row.empName}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-semibold">
                            {row.softwareOTHours}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-semibold">
                            {row.hrOTHours ?? "N/A"}
                          </td>
                          <td
                            className={`px-4 py-3 whitespace-nowrap text-sm ${diffClass}`}
                          >
                            {row.difference === 0 ? (
                              <span className="inline-flex items-center">
                                ✓ {row.difference}
                              </span>
                            ) : (
                              row.difference
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
