// src/components/LateComparison.tsx
"use client";

import React, { useMemo, useState, useCallback } from "react";
import { useExcel } from "@/context/ExcelContext";
import { EmployeeData } from "@/lib/types";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp } from "lucide-react";
import { useFinalDifference } from "@/context/FinalDifferenceContext";

// --- Import fixed export utility and interface ---
import {
  exportLateComparisonToExcel,
  LateComparisonExportData,
} from "@/lib/exportComparisonUtils";

// --- Import new hook (HR lookup) ---
import { useHRLateLookup } from "@/hooks/useHRLateLookup";
import { useMaintenanceDeductLookup } from "@/hooks/useMaintenanceDeductLookup";

/* ============================================================
   Utility helpers (same as your other file)
   ============================================================ */
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + (minutes || 0);
};

const minutesToHHMM = (totalMinutes: number): string => {
  if (isNaN(totalMinutes) || totalMinutes <= 0) return "0:00";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

const canon = (s: string) => (s ?? "").toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";
const nameKey = (s: string) => stripNonAlnum(s);

/* ============================================================
   Employee type helper: detect Staff vs Worker
   (kept identical to your other file)
   ============================================================ */
const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${emp.department ?? ""
    }`.toLowerCase();
  // Check for explicit staff keywords first
  if (inStr.includes("staff")) return true;
  // Check for explicit worker keywords (including c cash)
  if (inStr.includes("c cash")) return false;
  if (inStr.includes("worker")) return false;
  // ⭐ Default to WORKER (false)
  return false;
};

/* ============================================================
   In-file Hook: useLunchInOutLookup
   - Finds the uploaded lunch file and builds lookup maps
   - Returns getLunchDataForEmployee(emp)
   ============================================================ */
function useLunchInOutLookup() {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];

    const lunchFile = files.find((f: any) => {
      const n = (f?.fileName || "").toString().toLowerCase();
      return (
        f.status === "success" && (n.includes("lunch") || n.includes("04."))
      );
    });

    if (!lunchFile) {
      // no lunch file
      return { getLunchDataForEmployee: () => null };
    }

    let lunchEmployees: any[] = [];

    if (
      (lunchFile as any).lunchInOutData &&
      Array.isArray((lunchFile as any).lunchInOutData)
    ) {
      lunchEmployees = (lunchFile as any).lunchInOutData;
    } else if (
      (lunchFile as any).data?.employees &&
      Array.isArray((lunchFile as any).data.employees)
    ) {
      lunchEmployees = (lunchFile as any).data.employees;
    } else if (Array.isArray((lunchFile as any).employees)) {
      lunchEmployees = (lunchFile as any).employees;
    } else {
      // fallback: try to find something reasonable
      if ((lunchFile as any).data && Array.isArray((lunchFile as any).data)) {
        lunchEmployees = (lunchFile as any).data;
      }
    }

    const key = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";

    const employeeByCode = new Map<string, any>();
    const employeeByName = new Map<string, any>();

    for (const emp of lunchEmployees) {
      if (!emp) continue;
      if (emp.empCode) {
        const codeKey = key(emp.empCode);
        const numKey = numOnly(emp.empCode);
        employeeByCode.set(codeKey, emp);
        if (numKey) employeeByCode.set(numKey, emp);
      }
      if (emp.empName) {
        const nkey = key(emp.empName);
        employeeByName.set(nkey, emp);
      }
    }

    const getLunchDataForEmployee = (
      emp: Pick<EmployeeData, "empCode" | "empName">
    ) => {
      const empCodeK = key(emp.empCode ?? "");
      const empNameK = key(emp.empName ?? "");
      const numCodeK = numericOnly(emp.empCode ?? "");

      let found = employeeByCode.get(empCodeK);
      if (!found && numCodeK) found = employeeByCode.get(numCodeK);
      if (!found) found = employeeByName.get(empNameK);
      return found || null;
    };

    return { getLunchDataForEmployee };
  }, [getAllUploadedFiles]);
}

/* ============================================================
   In-file Hook: useCustomTimingLookup
   - Finds the 09-06 (time granted) file and builds lookup maps
   - Returns getCustomTimingForEmployee(emp)
   ============================================================ */
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

    let customTimingEmployees: any[] = [];

    if (
      (customTimingFile as any).customTimingOTData &&
      Array.isArray((customTimingFile as any).customTimingOTData)
    ) {
      customTimingEmployees = (customTimingFile as any).customTimingOTData;
    } else if (
      (customTimingFile as any).data?.employees &&
      Array.isArray((customTimingFile as any).data.employees)
    ) {
      customTimingEmployees = (customTimingFile as any).data.employees;
    } else if (Array.isArray((customTimingFile as any).employees)) {
      customTimingEmployees = (customTimingFile as any).employees;
    } else if (
      (customTimingFile as any).data &&
      Array.isArray((customTimingFile as any).data)
    ) {
      customTimingEmployees = (customTimingFile as any).data;
    }

    const norm = (s: string) => (s ?? "").toString().toUpperCase().trim();
    const key = (s: string) => norm(s).replace(/[^A-Z0-9]/g, "");
    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";

    const employeeByCode = new Map<string, any>();
    const employeeByName = new Map<string, any>();

    for (const emp of customTimingEmployees) {
      if (!emp) continue;
      if (emp.empCode) {
        const codeKey = key(emp.empCode);
        const numKey = numOnly(emp.empCode);
        employeeByCode.set(codeKey, emp);
        if (numKey) employeeByCode.set(numKey, emp);
      }
      if (emp.empName) {
        const nameK = key(emp.empName);
        employeeByName.set(nameK, emp);
      }
    }

    const getCustomTimingForEmployee = (
      emp: Pick<EmployeeData, "empCode" | "empName">
    ) => {
      const empCodeK = key(emp.empCode ?? "");
      const empNameK = key(emp.empName ?? "");
      const numCodeK = numericOnly(emp.empCode ?? "");

      let found = employeeByCode.get(empCodeK);
      if (!found && numCodeK) found = employeeByCode.get(numCodeK);
      if (!found) found = employeeByName.get(empNameK);

      if (!found) return null;

      const timeStr = found.customTime || "9:00 TO 6:00";
      const match = timeStr.match(
        /(\d{1,2}):(\d{2})\s*TO\s*(\d{1,2}):(\d{2})/i
      );
      if (match) {
        const startHour = parseInt(match[1], 10);
        const startMin = parseInt(match[2] || "0", 10);
        const expectedStartMinutes = startHour * 60 + startMin;

        const endHour = parseInt(match[3], 10);
        const endMin = parseInt(match[4] || "0", 10);
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

/* ============================================================
   Final combined calculation (copied & adapted from
   EarlyDepartureStatsGrid's stats logic)
   - Returns totalCombinedMinutes (after staff relaxation)
   - Also returns detailed breakdown (late, earlyDep, breakExcess, lessThan4Hr)
   ============================================================ */

const STAFF_RELAXATION_MINUTES = 4 * 60; // 4 hours in minutes

const BREAK_DEFINITIONS = [
  { name: "Tea Break 1", start: 10 * 60 + 15, end: 10 * 60 + 30, allowed: 15 }, // 10:15 - 10:30
  { name: "Lunch Break", start: 12 * 60 + 30, end: 14 * 60, allowed: 30 },      // 12:30 - 14:00
  { name: "Tea Break 2", start: 15 * 60 + 15, end: 15 * 60 + 30, allowed: 15 }, // 15:15 - 15:30
  { name: "Dinner Break", start: 19 * 60 + 30, end: 21 * 60, allowed: 30 },     // 19:30 - 21:00
];

const calculateFinalSoftwareMinutes = (
  employee: EmployeeData,
  lunchData: any | null,
  customTiming: {
    expectedStartMinutes: number;
    expectedEndMinutes: number;
  } | null,
  isMaintenance: boolean = false
) => {
  // Standard timing rules
  const STANDARD_START_MINUTES = 8 * 60 + 30;
  const EVENING_SHIFT_START_MINUTES = 13 * 60 + 15;
  const MORNING_EVENING_CUTOFF_MINUTES = 10 * 60;
  const PERMISSIBLE_LATE_MINS = 5;

  const employeeNormalStartMinutes =
    customTiming?.expectedStartMinutes ?? STANDARD_START_MINUTES;
  const isStaff = getIsStaff(employee);

  // 1) Late minutes
  let lateMinsTotal = 0;

  // 2) Early departure
  let earlyDepartureTotalMinutes = 0;

  // 3) Less than 4 hrs (P/A)
  let lessThan4HrMins = 0;

  // 4) Break excess minutes (from lunchData)
  let breakExcessMinutes = 0;

  // a) compute late, early depart, less-than-4 across days
  employee.days?.forEach((day) => {
    const status = (day.attendance.status || "").toUpperCase();
    const inTime = day.attendance.inTime;

    // Less than 4hr check
    const workHours = day.attendance.workHrs || 0;
    let workMins = 0;
    if (typeof workHours === "string" && workHours.includes(":")) {
      const [h, m] = workHours.split(":").map(Number);
      workMins = h * 60 + (m || 0);
    } else if (!isNaN(Number(workHours))) {
      workMins = Number(workHours) * 60;
    }

    // Late calculation
    if (inTime && inTime !== "-") {
      const inMinutes = timeToMinutes(inTime);
      let dailyLateMins = 0;

      // ⭐ STRICT CUSTOM TIMING RULE:
      if (customTiming) {
        if (inMinutes > employeeNormalStartMinutes) {
          dailyLateMins = inMinutes - employeeNormalStartMinutes;
        }
      } else {
        // Standard Logic
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
        } else if (status === "P") {
          if (inMinutes > employeeNormalStartMinutes) {
            dailyLateMins = inMinutes - employeeNormalStartMinutes;
          }
        } else if (isStaff && status === "ADJ-P") {
          if (inMinutes > employeeNormalStartMinutes) {
            dailyLateMins = inMinutes - employeeNormalStartMinutes;
          }
        }
      }

      if (dailyLateMins > PERMISSIBLE_LATE_MINS) {
        lateMinsTotal += dailyLateMins;
      }
    }

    // Early departure: from day.attendance.earlyDep
    const earlyDepMins = Number(day.attendance.earlyDep) || 0;

    // ❌ RULE: Skip early departure completely if status is "M/WO-I"
    if (status === "M/WO-I") {
      return; // skip this day
    }

    // Check for half day (<= 240 mins)
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
    let dailyEarlyDep = 0;
    if (customTiming && day.attendance.outTime && day.attendance.outTime !== "-") {
      const outMinutes = timeToMinutes(day.attendance.outTime);
      if (outMinutes < customTiming.expectedEndMinutes) {
        dailyEarlyDep = customTiming.expectedEndMinutes - outMinutes;
      }
    } else {
      dailyEarlyDep = earlyDepMins;
    }

    if (dailyEarlyDep > 0) {
      earlyDepartureTotalMinutes += dailyEarlyDep;
    }

  });

  // b) compute break excess using lunchData (if present)
  if (lunchData && Array.isArray(lunchData.dailyPunches)) {
    // Define dynamic breaks including the evening break
    const breaks = [
      ...BREAK_DEFINITIONS,
      {
        name: "Evening Break",
        start: 17 * 60 + 30,
        end: isMaintenance ? 18 * 60 + 30 : 18 * 60,
        allowed: 15
      }
    ];

    for (const dayData of lunchData.dailyPunches) {
      const punches = dayData.punches || [];
      if (!Array.isArray(punches) || punches.length < 2) continue;

      type Punch = { type: string; time: string };
      type PunchTime = { type: string; minutes: number; time: string };

      const punchTimes: PunchTime[] = (punches as Punch[])
        .map((p: Punch) => ({
          type: p.type,
          time: p.time,
          minutes: timeToMinutes(p.time),
        }))
        .filter((p) => p.minutes > 0);

      if (punchTimes.length < 2) continue;

      // Find Out → In break pairs
      const breakPeriods: any[] = [];
      for (let i = 0; i < punchTimes.length - 1; i++) {
        if (
          punchTimes[i].type === "Out" &&
          punchTimes[i + 1].type === "In" &&
          punchTimes[i + 1].minutes > punchTimes[i].minutes
        ) {
          breakPeriods.push({
            outMinutes: punchTimes[i].minutes,
            inMinutes: punchTimes[i + 1].minutes,
            duration: punchTimes[i + 1].minutes - punchTimes[i].minutes,
          });
        }
      }

      if (breakPeriods.length === 0) continue;

      for (const bp of breakPeriods) {
        let allowed = 0;

        // Allowed break overlaps
        for (const defBreak of breaks) {
          const overlapStart = Math.max(bp.outMinutes, defBreak.start);
          const overlapEnd = Math.min(bp.inMinutes, defBreak.end);
          const overlap = Math.max(0, overlapEnd - overlapStart);
          allowed += Math.min(overlap, defBreak.allowed);
        }

        // Excess
        breakExcessMinutes += Math.max(0, bp.duration - allowed);
      }
    }
  }

  // c) final total before relaxation
  // At the end of calculateFinalSoftwareMinutes function, replace the return with:

  // c) final total before relaxation
  let totalBeforeRelaxation =
    Math.round(lateMinsTotal) +
    Math.round(earlyDepartureTotalMinutes) +
    Math.round(breakExcessMinutes) +
    Math.round(lessThan4HrMins);

  // d) apply staff relaxation
  let totalAfterRelaxation = totalBeforeRelaxation;
  if (isStaff) {
    totalAfterRelaxation = Math.max(
      0,
      totalBeforeRelaxation - STAFF_RELAXATION_MINUTES
    );
  }

  // Return with guaranteed integers
  const ret = {
    Late_hours_in_minutes: Math.round(lateMinsTotal),
    earlyDepartureTotalMinutes: Math.round(earlyDepartureTotalMinutes),
    breakExcessMinutes: Math.round(breakExcessMinutes),
    lessThan4HrMins: Math.round(lessThan4HrMins),
    totalBeforeRelaxation: Math.round(totalBeforeRelaxation),
    totalCombinedMinutes: Math.round(totalAfterRelaxation),
  };

  return ret;
};

/* ============================================================
   Types & Sorting Helpers (same as your file)
   ============================================================ */
interface LateComparisonData {
  empCode: string;
  empName: string;
  softwareTotalHours: number;
  hrLateHours: number | null;
  difference: number | string;
}
type SortColumn = keyof LateComparisonData | "difference" | "category";
type SortDirection = "asc" | "desc";
type DifferenceCategory = "N/A" | "Match" | "Minor" | "Medium" | "Major";
interface SortableLateComparisonData extends LateComparisonData {
  category: DifferenceCategory;
  company: string; // <-- ADD THIS
}

const getDifferenceCategory = (
  diff: number | string
): { category: DifferenceCategory; sortValue: number } => {
  if (diff === "N/A") {
    return { category: "N/A", sortValue: 0 };
  }
  const absDiff = Math.abs(diff as number);
  if (absDiff === 0) return { category: "Match", sortValue: 5 };
  else if (absDiff > 2) return { category: "Major", sortValue: 4 };
  else if (absDiff > 1) return { category: "Medium", sortValue: 3 };
  else return { category: "Minor", sortValue: 2 };
};

const handleScrollToEmployee = (empCode: string) => {
  const element = document.getElementById(`employee-${empCode}`);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("ring-4", "ring-blue-400");
    setTimeout(() => element.classList.remove("ring-4", "ring-blue-400"), 2000);
  }
};

/* ============================================================
   Component: LateComparison (FULL)
   ============================================================ */
export const LateComparison: React.FC = () => {
  const { excelData } = useExcel();

  // 🆕 Get Total(-4hrs) from context
  const { totalMinus4 } = useFinalDifference();

  const [showTable, setShowTable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { getHRLateValue } = useHRLateLookup();
  const { isMaintenanceEmployee } = useMaintenanceDeductLookup();

  // Use the in-file hooks
  const { getLunchDataForEmployee } = useLunchInOutLookup();
  const { getCustomTimingForEmployee } = useCustomTimingLookup();

  const [filterCategory, setFilterCategory] = useState<
    DifferenceCategory | "All" | null
  >(null);
  const [sortConfig, setSortConfig] = useState<{
    key: SortColumn;
    direction: SortDirection;
  }>({
    key: "empCode",
    direction: "asc",
  });
  const [filterCompany, setFilterCompany] = useState<string>("All");

  const companies = [
    "INDIANA OPHTHALMICS LLP",
    "NUTRACEUTICO",
    "SCI PREC",
    "SCI PREC LIFESCIENCES",
  ];

  // Calculate and annotate data with category (NOW using final calculation)
  const categorizedData: SortableLateComparisonData[] = useMemo(() => {
    if (!excelData || !excelData.employees || !showTable) return [];
    setIsLoading(true);

    const data: SortableLateComparisonData[] = excelData.employees.map(
      (employee: EmployeeData) => {
        // We need to calculate the software total here if we want to compare against HR
        // But wait, the user said "Get Total(-4hrs) from context" in line 524.
        // However, the context might not be updated with the new break rules unless we update the context provider too.
        // The context provider likely uses `unifiedCalculations.ts`.
        // If we updated `unifiedCalculations.ts`, the context should be correct.
        // BUT, `LateComparison` seems to be recalculating it locally or using context?

        // Line 524: const { totalMinus4 } = useFinalDifference();
        // Line 565: const softwareTotalMinutes = totalMinus4.get(employee.empCode) ?? 0;

        // If `LateComparison` relies on `totalMinus4` from context, and context uses `unifiedCalculations.ts`,
        // then my update to `unifiedCalculations.ts` should be enough for the context value.
        // BUT `LateComparison` ALSO has `calculateFinalSoftwareMinutes` defined locally.
        // Is it used?
        // Let's check where `calculateFinalSoftwareMinutes` is called.
        // It seems it is NOT called in the `categorizedData` useMemo in the previous file content (Step 79).
        // It uses `totalMinus4.get(employee.empCode)`.

        // So `calculateFinalSoftwareMinutes` might be dead code or used elsewhere?
        // Ah, I see `calculateFinalSoftwareMinutes` definition but I don't see it being CALLED in the visible part of Step 79.
        // Wait, if `LateComparison` uses `totalMinus4` from context, then I need to make sure `FinalDifferenceContext` passes `isMaintenance` to `unifiedCalculations`.

        // Let's check `FinalDifferenceContext.tsx`.

        const softwareTotalMinutes = totalMinus4.get(employee.empCode) ?? 0;

        // Convert to decimal hours
        const softwareTotalHours = Number(
          (softwareTotalMinutes / 60).toFixed(2)
        );

        const hrLateHours: number | null = getHRLateValue(employee);

        const difference: number | string =
          hrLateHours === null
            ? "N/A"
            : Number((softwareTotalHours - hrLateHours).toFixed(2));

        const { category } = getDifferenceCategory(difference);

        return {
          empCode: employee.empCode,
          empName: employee.empName,
          softwareTotalHours,
          hrLateHours,
          difference,
          category,
          company: employee.companyName,
        };
      }
    );

    setIsLoading(false);
    return data;
  }, [
    excelData,
    showTable,
    getHRLateValue,
    totalMinus4, // Added dependency
    // getLunchDataForEmployee, // Unused if we use context
    // getCustomTimingForEmployee, // Unused if we use context
  ]);

  /* ------------------ Sorting ------------------ */
  const sortedData = useMemo(() => {
    if (categorizedData.length === 0) return [];
    const sortableData = [...categorizedData];

    sortableData.sort((a, b) => {
      const { key, direction } = sortConfig;

      let aValue: string | number | null = null;
      let bValue: string | number | null = null;

      if (key === "category") {
        const { sortValue: aSortValue } = getDifferenceCategory(a.difference);
        const { sortValue: bSortValue } = getDifferenceCategory(b.difference);
        return direction === "asc"
          ? aSortValue - bSortValue
          : bSortValue - aSortValue;
      } else if (key === "difference") {
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
      } else if (key === "hrLateHours") {
        aValue =
          a.hrLateHours === null
            ? direction === "asc"
              ? Infinity
              : -Infinity
            : a.hrLateHours;
        bValue =
          b.hrLateHours === null
            ? direction === "asc"
              ? Infinity
              : -Infinity
            : b.hrLateHours;
      } else if (
        key === "empCode" ||
        key === "empName" ||
        key === "softwareTotalHours"
      ) {
        aValue = (a as any)[key];
        bValue = (b as any)[key];
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

  /* ------------------ Filtering ------------------ */
  const filteredData = useMemo(() => {
    let data = sortedData;

    // Category filter
    if (filterCategory && filterCategory !== "All") {
      data = data.filter((row) => row.category === filterCategory);
    }

    // Company filter
    if (filterCompany !== "All") {
      data = data.filter((row) => row.company === filterCompany);
    }

    return data;
  }, [sortedData, filterCategory, filterCompany]);

  const requestSort = useCallback(
    (key: SortColumn) => {
      let direction: SortDirection = "asc";
      if (sortConfig.key === key && sortConfig.direction === "asc")
        direction = "desc";
      setSortConfig({ key, direction });
    },
    [sortConfig]
  );

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

  const getDiffClass = (category: DifferenceCategory): string => {
    switch (category) {
      case "Major":
        return "text-red-600 font-extrabold";
      case "Medium":
        return "text-orange-600 font-bold";
      case "Minor":
        return "text-gray-900 font-medium";
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
      "px-4 py-2 text-sm font-bold rounded-lg transition-all shadow-sm border flex items-center gap-2";
    const isSelected = filterCategory === buttonCategory;

    if (isSelected) {
      switch (buttonCategory) {
        case "Major":
          return `${baseClass} bg-red-600 text-white border-red-700 ring-2 ring-red-300`;
        case "Medium":
          return `${baseClass} bg-orange-500 text-white border-orange-600 ring-2 ring-orange-300`;
        case "Minor":
          return `${baseClass} bg-gray-600 text-white border-gray-700 ring-2 ring-gray-300`;
        case "Match":
          return `${baseClass} bg-green-600 text-white border-green-700 ring-2 ring-green-300`;
        case "N/A":
          return `${baseClass} bg-gray-500 text-white border-gray-600 ring-2 ring-gray-300`;
        case "All":
        default:
          return `${baseClass} bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300`;
      }
    } else {
      // Unselected state - use lighter versions or outlines
      switch (buttonCategory) {
        case "Major":
          return `${baseClass} bg-red-50 text-red-700 border-red-200 hover:bg-red-100`;
        case "Medium":
          return `${baseClass} bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100`;
        case "Minor":
          return `${baseClass} bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100`;
        case "Match":
          return `${baseClass} bg-green-50 text-green-700 border-green-200 hover:bg-green-100`;
        case "N/A":
          return `${baseClass} bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100`;
        case "All":
        default:
          return `${baseClass} bg-white text-gray-700 border-gray-300 hover:bg-gray-50`;
      }
    }
  };



  const handleExportClick = () => {
    if (categorizedData.length === 0) {
      console.warn("Please click 'Compare' first to generate data.");
      return;
    }
    const exportData: LateComparisonExportData[] = categorizedData.map(
      ({ category, ...rest }) => ({
        ...rest,
        DifferenceCategory: category,
      })
    );
    exportLateComparisonToExcel(exportData, "Late_Comparison.xlsx");
  };

  if (!excelData) return null;

  const tableHeaders: { label: string; key: SortColumn }[] = [
    { label: "Emp Code", key: "empCode" },
    { label: "Emp Name", key: "empName" },
    { label: "Software Total (Hours)", key: "softwareTotalHours" },
    { label: "HR (Tulsi) Late (Hours)", key: "hrLateHours" },
    { label: "Difference", key: "difference" },
  ];

  /* ------------------ Render ------------------ */
  return (
    <div className="mt-8 pt-6 border-t border-gray-300">
      <div
        className="flex items-center justify-between mb-4 cursor-pointer group select-none"
        onClick={() => setShowTable(!showTable)}
      >
        <h3 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
          Late Arrival Comparison
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
            Export Late Comparison
          </button>

          <div className="flex gap-2 items-center flex-wrap bg-gray-50 p-3 rounded-lg border border-gray-200 w-full">
            <span className="text-sm font-medium text-gray-700 mr-2">
              Filters:
            </span>
            <button
              onClick={() => setFilterCategory("All")}
              className={getCategoryButtonClass("All")}
            >
              All <span className="opacity-80 text-xs ml-1">({categorizedData.length})</span>
            </button>
            <button
              onClick={() => setFilterCategory("Major")}
              className={getCategoryButtonClass("Major")}
            >
              Major{" "}
              <span className="opacity-80 text-xs ml-1">
                (
                {
                  categorizedData.filter((row) => row.category === "Major")
                    .length
                }
                )
              </span>
            </button>
            <button
              onClick={() => setFilterCategory("Medium")}
              className={getCategoryButtonClass("Medium")}
            >
              Medium{" "}
              <span className="opacity-80 text-xs ml-1">
                (
                {
                  categorizedData.filter((row) => row.category === "Medium")
                    .length
                }
                )
              </span>
            </button>
            <button
              onClick={() => setFilterCategory("Minor")}
              className={getCategoryButtonClass("Minor")}
            >
              Minor{" "}
              <span className="opacity-80 text-xs ml-1">
                (
                {
                  categorizedData.filter((row) => row.category === "Minor")
                    .length
                }
                )
              </span>
            </button>
            <button
              onClick={() => setFilterCategory("Match")}
              className={getCategoryButtonClass("Match")}
            >
              Match{" "}
              <span className="opacity-80 text-xs ml-1">
                (
                {
                  categorizedData.filter((row) => row.category === "Match")
                    .length
                }
                )
              </span>
            </button>
            <button
              onClick={() => setFilterCategory("N/A")}
              className={getCategoryButtonClass("N/A")}
            >
              N/A{" "}
              <span className="opacity-80 text-xs ml-1">
                ({categorizedData.filter((row) => row.category === "N/A").length})
              </span>
            </button>
          </div>
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
              {/* Summary Stats */}
              {/* Summary Removed as per request to show numbers once in filters */}

              {/* Comparison Table */}
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
                          {/* Clickable Emp Code */}
                          <td
                            className="px-4 py-3 whitespace-nowrap text-sm text-blue-600 font-medium cursor-pointer hover:text-blue-800 hover:underline"
                            onClick={() => handleScrollToEmployee(row.empCode)}
                          >
                            {row.empCode}
                          </td>

                          {/* Clickable Emp Name */}
                          <td
                            className="px-4 py-3 whitespace-nowrap text-sm text-blue-600 cursor-pointer hover:text-blue-800 hover:underline"
                            onClick={() => handleScrollToEmployee(row.empCode)}
                          >
                            {row.empName}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-semibold">
                            {row.softwareTotalHours}{" "}
                            <span className="text-xs text-gray-500">
                              (
                              {minutesToHHMM(
                                Math.round(row.softwareTotalHours * 60)
                              )}
                              )
                            </span>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-semibold">
                            {row.hrLateHours ?? "N/A"}
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
