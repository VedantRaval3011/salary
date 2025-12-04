"use client";

import React, { useMemo, useState, useCallback } from "react";
import { useExcel } from "@/context/ExcelContext";
import { EmployeeData } from "@/lib/types";
import { useFinalDifference } from "@/context/FinalDifferenceContext";
import { useHRDataLookup } from "@/hooks/useHRDataLookup";
import { useHRLateLookup } from "@/hooks/useHRLateLookup";
import { useHROTLookup } from "@/hooks/useHROTLookup";
import { calculateEmployeeStats } from "@/lib/statsCalculator";
import { calculateTotalCombinedMinutes } from "@/lib/unifiedCalculations";
import { exportUnifiedComparisonToExcel, exportMajorMediumDifferences } from "@/lib/exportUnifiedComparison";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp } from "lucide-react";

// --- Types ---

type DifferenceCategory = "N/A" | "Match" | "Minor" | "Medium" | "Major";

interface UnifiedComparisonRow {
  srNo: number;
  empCode: string;
  empName: string;
  company: string;

  // Present Days
  softwarePresentDays: number;
  hrPresentDays: number | null;
  presentDaysDiff: number | string;
  presentDaysCategory: DifferenceCategory;

  // Late (Hours)
  softwareLateHours: number;
  hrLateHours: number | null;
  lateDiff: number | string;
  lateCategory: DifferenceCategory;

  // OT (Hours)
  softwareOTHours: number;
  hrOTHours: number | null;
  otDiff: number | string;
  otCategory: DifferenceCategory;
}

type SortColumn = keyof UnifiedComparisonRow;
type SortDirection = "asc" | "desc";

// --- Helpers ---

const canon = (s: string) => (s ?? "").toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");
const nameKey = (s: string) => stripNonAlnum(s);

const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return (hours || 0) * 60 + (minutes || 0);
};

const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${emp.department ?? ""}`.toLowerCase();
  if (inStr.includes("c cash")) return false;
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  return true;
};

// --- Thresholds ---

const getPresentDayCategory = (diff: number | string): DifferenceCategory => {
  if (diff === "N/A") return "N/A";
  const abs = Math.abs(diff as number);
  if (abs === 0) return "Match";
  if (abs >= 1) return "Major";
  if (abs >= 0.5) return "Medium";
  return "Minor";
};

const getLateCategory = (diff: number | string): DifferenceCategory => {
  if (diff === "N/A") return "N/A";
  const abs = Math.abs(diff as number);
  if (abs === 0) return "Match";
  if (abs > 2) return "Major";
  if (abs > 1) return "Medium";
  return "Minor";
};

const getOTCategory = (diff: number | string): DifferenceCategory => {
  if (diff === "N/A") return "N/A";
  const abs = Math.abs(diff as number);
  if (abs === 0) return "Match";
  if (abs > 2) return "Major";
  if (abs > 1) return "Medium";
  return "Minor";
};

// --- Local Hooks (Copied from other components) ---

function usePaidLeaveLookup() {
  const { getAllUploadedFiles } = useExcel();
  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
    const plRows = files
      .filter((f) => f.status === "success" && Array.isArray(f.paidLeaveData) && f.paidLeaveData.length > 0)
      .flatMap((f) => f.paidLeaveData!);

    // Build lookup maps... (Simplified for brevity, assuming same logic as PresentDayComparison)
    // Actually, to ensure correctness, I should copy the logic fully.

    type PLRec = (typeof plRows)[number] & { _keys: string[]; _nameKey: string };
    const withKeys: PLRec[] = plRows.map((pl) => {
      const raw = canon(pl.empCode);
      const s1 = stripNonAlnum(raw);
      const num = numericOnly(raw);
      const no0 = dropLeadingZeros(num);
      const pads = [4, 5, 6].map((w) => num.padStart(w, "0"));
      const keySet = new Set<string>([raw, s1, num, no0, ...pads]);
      return { ...pl, _keys: Array.from(keySet), _nameKey: nameKey(pl.empName) };
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

function useStaffOTGrantedLookup() {
  const { getAllUploadedFiles } = useExcel();
  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
    const staffOTFile = files.find((f: any) =>
      f.status === "success" && f.fileName.toLowerCase().includes("staff") && f.fileName.toLowerCase().includes("ot") && f.fileName.toLowerCase().includes("granted")
    );
    if (!staffOTFile) return { getGrantForEmployee: () => undefined };

    let otEmployees: any[] = [];
    if (staffOTFile.otGrantedData && Array.isArray(staffOTFile.otGrantedData)) otEmployees = staffOTFile.otGrantedData;
    else if (staffOTFile.data?.employees && Array.isArray(staffOTFile.data.employees)) otEmployees = staffOTFile.data.employees;

    const key = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
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
      if (emp.empName) byName.set(key(emp.empName), emp);
    }

    const getGrantForEmployee = (emp: Pick<EmployeeData, "empCode" | "empName">) => {
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

function useFullNightOTLookup() {
  const { getAllUploadedFiles } = useExcel();
  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
    const fullNightFile = files.find((f: any) =>
      f.status === "success" && f.fileName.toLowerCase().includes("full") && f.fileName.toLowerCase().includes("night")
    );
    if (!fullNightFile) return { getFullNightOTForEmployee: () => 0 };

    let fullNightEmployees: any[] = [];
    if (fullNightFile.fullNightOTData) fullNightEmployees = fullNightFile.fullNightOTData;
    else if (fullNightFile.data?.employees) fullNightEmployees = fullNightFile.data.employees;

    const key = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";
    const employeeByCode = new Map<string, number>();
    const employeeByName = new Map<string, number>();

    for (const emp of fullNightEmployees) {
      const hours = Number(emp.totalHours) || 0;
      if (emp.empCode) {
        const codeKey = key(emp.empCode);
        const numKey = numOnly(emp.empCode);
        employeeByCode.set(codeKey, (employeeByCode.get(codeKey) || 0) + hours);
        if (numKey && numKey !== codeKey) employeeByCode.set(numKey, (employeeByCode.get(numKey) || 0) + hours);
      }
      if (emp.empName) {
        const nameKey = key(emp.empName);
        employeeByName.set(nameKey, (employeeByName.get(nameKey) || 0) + hours);
      }
    }

    const getFullNightOTForEmployee = (emp: Pick<EmployeeData, "empCode" | "empName">) => {
      const empCodeK = key(emp.empCode);
      const empNameK = key(emp.empName);
      const numCodeK = numOnly(emp.empCode);
      let total = employeeByCode.get(empCodeK);
      if (total === undefined && numCodeK) total = employeeByCode.get(numCodeK);
      if (total === undefined) total = employeeByName.get(empNameK);
      return total || 0;
    };
    return { getFullNightOTForEmployee };
  }, [getAllUploadedFiles]);
}

function useCustomTimingLookup() {
  const { getAllUploadedFiles } = useExcel();
  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
    const customTimingFile = files.find((f: any) =>
      f.status === "success" && ((f.fileName.toLowerCase().includes("09") && f.fileName.toLowerCase().includes("06")) || (f.fileName.toLowerCase().includes("9") && f.fileName.toLowerCase().includes("6")))
    );
    if (!customTimingFile) return { getCustomTimingForEmployee: () => null };

    let customTimingEmployees: any[] = [];
    if (customTimingFile.customTimingOTData) customTimingEmployees = customTimingFile.customTimingOTData;
    else if (customTimingFile.data?.employees) customTimingEmployees = customTimingFile.data.employees;

    const key = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
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
      if (emp.empName) employeeByName.set(key(emp.empName), emp);
    }

    const getCustomTimingForEmployee = (emp: Pick<EmployeeData, "empCode" | "empName">) => {
      const empCodeK = key(emp.empCode);
      const empNameK = key(emp.empName);
      const numCodeK = numOnly(emp.empCode);
      let found = employeeByCode.get(empCodeK);
      if (!found && numCodeK) found = employeeByCode.get(numCodeK);
      if (!found) found = employeeByName.get(empNameK);

      if (!found) return null;
      const timeStr = found.customTime || "9:00 TO 6:00";
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*TO\s*(\d{1,2}):(\d{2})/i);
      if (match) {
        const startHour = parseInt(match[1]);
        const startMin = parseInt(match[2] || "0");
        const expectedStartMinutes = startHour * 60 + startMin;
        const endHour = parseInt(match[3]);
        const endMin = parseInt(match[4] || "0");
        const expectedEndMinutes = endHour * 60 + endMin;
        return { customTime: timeStr, expectedEndMinutes, expectedStartMinutes };
      }
      return null;
    };
    return { getCustomTimingForEmployee };
  }, [getAllUploadedFiles]);
}

function useMaintenanceDeductLookup() {
  const { getAllUploadedFiles } = useExcel();
  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
    const deductFile = files.find((f: any) => f.status === "success" && f.fileName.toLowerCase().includes("maintenance") && f.fileName.toLowerCase().includes("deduct"));
    if (!deductFile) return { isMaintenanceEmployee: () => false };

    let maintenanceEmployees: any[] = [];
    if (deductFile.data?.employees) maintenanceEmployees = deductFile.data.employees;

    const key = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
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
      if (name) employeeNameSet.add(key(String(name)));
    }

    const isMaintenanceEmployee = (emp: Pick<EmployeeData, "empCode" | "empName">) => {
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

function useLunchInOutLookup() {
  const { getAllUploadedFiles } = useExcel();
  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
    const lunchFile = files.find((f: any) => f.status === "success" && (f.fileName.toLowerCase().includes("lunch") || f.fileName.toLowerCase().includes("04.")));
    if (!lunchFile) return { getLunchDataForEmployee: () => null };

    let lunchEmployees: any[] = [];
    if (lunchFile.lunchInOutData) lunchEmployees = lunchFile.lunchInOutData;
    else if (lunchFile.data?.employees) lunchEmployees = lunchFile.data.employees;

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
      if (emp.empName) employeeByName.set(key(emp.empName), emp);
    }

    const getLunchDataForEmployee = (emp: Pick<EmployeeData, "empCode" | "empName">) => {
      const empCodeK = key(emp.empCode ?? "");
      const empNameK = key(emp.empName ?? "");
      const numCodeK = numOnly(emp.empCode ?? "");
      let found = employeeByCode.get(empCodeK);
      if (!found && numCodeK) found = employeeByCode.get(numCodeK);
      if (!found) found = employeeByName.get(empNameK);
      return found || null;
    };
    return { getLunchDataForEmployee };
  }, [getAllUploadedFiles]);
}

// --- OT Calculation Logic (Copied from OTComparison.tsx) ---

function calculateFinalOT(
  employee: EmployeeData,
  getGrantForEmployee: any,
  getFullNightOTForEmployee: any,
  getCustomTimingForEmployee: any,
  isMaintenanceEmployee: any
): number {
  const isStaff = getIsStaff(employee);
  const grant = getGrantForEmployee(employee);
  const customTiming = getCustomTimingForEmployee(employee);

  const parseMinutes = (val?: string | number | null): number => {
    if (!val) return 0;
    const str = String(val).trim();
    if (str.includes(":")) return timeToMinutes(str);
    const dec = parseFloat(str);
    return isNaN(dec) ? 0 : Math.round(dec * 60);
  };

  const calculateCustomTimingOT = (outTime: string, expectedEndMinutes: number): number => {
    if (!outTime || outTime === "-") return 0;
    const outMin = timeToMinutes(outTime);
    const ot = outMin > expectedEndMinutes ? outMin - expectedEndMinutes : 0;
    return ot < 5 ? 0 : ot;
  };

  const ADJ_P_BUFFER_MINUTES = 30;
  const ADJ_P_SHIFT_END_MINUTES = 17 * 60 + 30;
  const ADJ_P_CUTOFF_MINUTES = ADJ_P_SHIFT_END_MINUTES + ADJ_P_BUFFER_MINUTES;

  let grantedFromSheetStaffMinutes = 0;
  let staffGrantedOTMinutes = 0;
  let staffNonGrantedOTMinutes = 0;
  let workerGrantedOTMinutes = 0;
  let worker9to6OTMinutes = 0;

  const getOtFieldMinutes = (attendanceObj: any) => {
    const otField = attendanceObj.otHours ?? attendanceObj.otHrs ?? attendanceObj.ot ?? attendanceObj.workHrs ?? attendanceObj.workHours ?? null;
    return parseMinutes(otField);
  };

  if (grant) {
    const fromD = Number(grant.fromDate) || 1;
    const toD = Number(grant.toDate) || 31;
    employee.days?.forEach((day) => {
      const dateNum = Number(day.date) || 0;
      if (dateNum < fromD || dateNum > toD) return;
      const status = (day.attendance.status || "").toUpperCase();
      const outTime = day.attendance.outTime;
      let dayOTMinutes = 0;
      if (customTiming) {
        dayOTMinutes = calculateCustomTimingOT(outTime, customTiming.expectedEndMinutes);
      } else if (status === "ADJ-P") {
        if (outTime && outTime !== "-") {
          const outMin = timeToMinutes(outTime);
          dayOTMinutes = outMin > ADJ_P_CUTOFF_MINUTES ? outMin - ADJ_P_SHIFT_END_MINUTES : 0;
        }
      } else {
        dayOTMinutes = getOtFieldMinutes(day.attendance);
      }
      grantedFromSheetStaffMinutes += dayOTMinutes;
    });
  } else {
    if (isStaff) {
      employee.days?.forEach((day) => {
        const dayName = (day.day || "").toLowerCase();
        const status = (day.attendance.status || "").toUpperCase();
        if (dayName === "sa" || status === "ADJ-P" || status === "WO-I" || status === "ADJ-M") {
          let dayOTMinutes = 0;
          if (customTiming) {
            dayOTMinutes = calculateCustomTimingOT(day.attendance.outTime, customTiming.expectedEndMinutes);
          } else if (status === "ADJ-P") {
            const outTime = day.attendance.outTime;
            if (outTime && outTime !== "-") {
              const outMin = timeToMinutes(outTime);
              dayOTMinutes = outMin > ADJ_P_CUTOFF_MINUTES ? outMin - ADJ_P_SHIFT_END_MINUTES : 0;
            }
          } else {
            dayOTMinutes = getOtFieldMinutes(day.attendance);
          }
          staffGrantedOTMinutes += dayOTMinutes;
        }
      });
    } else {
      employee.days?.forEach((day) => {
        const status = (day.attendance.status || "").toUpperCase();
        let dayOTMinutes = 0;
        if (customTiming) {
          dayOTMinutes = calculateCustomTimingOT(day.attendance.outTime, customTiming.expectedEndMinutes);
          if (dayOTMinutes > 0) worker9to6OTMinutes += dayOTMinutes;
        } else if (status === "ADJ-P") {
          const outTime = day.attendance.outTime;
          if (outTime && outTime !== "-") {
            const outMinutes = timeToMinutes(outTime);
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

  const totalFromStaffGrantLogic = grantedFromSheetStaffMinutes + staffGrantedOTMinutes;
  let finalOTForDeduction = isStaff ? totalFromStaffGrantLogic : workerGrantedOTMinutes;

  if (isMaintenanceEmployee(employee)) {
    finalOTForDeduction = finalOTForDeduction * 0.95;
  }

  const fullNightOTDecimal = getFullNightOTForEmployee(employee) || 0;
  const fullNightOTInMinutes = Math.round(fullNightOTDecimal * 60);

  let grandTotalMinutes = finalOTForDeduction + fullNightOTInMinutes;
  return Math.max(0, Math.round(grandTotalMinutes));
}

// --- Component ---

export const UnifiedComparison: React.FC = () => {
  const { excelData } = useExcel();
  const { employeeFinalDifferences, presentDayTotals, totalMinus4, overtimeGrandTotals } = useFinalDifference();
  const [showTable, setShowTable] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortColumn; direction: SortDirection }>({ key: "srNo", direction: "asc" });

  // Lookups
  const { getHRPresentDays } = useHRDataLookup();
  const { getHRLateValue } = useHRLateLookup();
  const { getHROTValue } = useHROTLookup();
  const { getPL } = usePaidLeaveLookup();
  const { getGrantForEmployee } = useStaffOTGrantedLookup();
  const { getFullNightOTForEmployee } = useFullNightOTLookup();
  const { getCustomTimingForEmployee } = useCustomTimingLookup();
  const { isMaintenanceEmployee } = useMaintenanceDeductLookup();
  const { getLunchDataForEmployee } = useLunchInOutLookup();

  const baseHolidaysCount = (excelData as any)?.baseHolidaysCount ?? 0;

  const getSelectedHolidaysCount = () => {
    if (!excelData?.employees?.[0]?.days) return 0;
    return excelData.employees[0].days.filter(
      (day) => day.attendance.status?.toUpperCase() === "H" && day.isHoliday
    ).length;
  };

  const selectedHolidaysCount = getSelectedHolidaysCount();

  const data: UnifiedComparisonRow[] = useMemo(() => {
    if (!excelData || !excelData.employees) return [];

    return excelData.employees.map((employee: EmployeeData, index: number) => {
      // 1. Present Days
      let softwarePresentDays = presentDayTotals.get(employee.empCode);
      if (softwarePresentDays === undefined) {
        const finalDifference = employeeFinalDifferences.get(employee.empCode) || 0;
        const stats = calculateEmployeeStats(
          employee,
          baseHolidaysCount,
          selectedHolidaysCount,
          getPL,
          getGrantForEmployee,
          getFullNightOTForEmployee,
          getCustomTimingForEmployee,
          isMaintenanceEmployee,
          finalDifference
        );
        softwarePresentDays = stats.GrandTotal;
      }
      softwarePresentDays = Number(softwarePresentDays.toFixed(1));
      const hrPresentDays = getHRPresentDays(employee);
      const presentDaysDiff = hrPresentDays === null ? "N/A" : Number((softwarePresentDays - hrPresentDays).toFixed(2));
      const presentDaysCategory = getPresentDayCategory(presentDaysDiff);

      // 2. Late (Hours)
      let softwareLateMinutes = totalMinus4.get(employee.empCode);
      if (softwareLateMinutes === undefined) {
        const lunchData = getLunchDataForEmployee(employee);
        const customTiming = getCustomTimingForEmployee(employee);
        const stats = calculateTotalCombinedMinutes(employee, lunchData, customTiming?.expectedStartMinutes, customTiming?.expectedEndMinutes);
        softwareLateMinutes = stats.totalAfterRelaxation;
      }
      const softwareLateHours = Number((softwareLateMinutes / 60).toFixed(2));
      const hrLateHours = getHRLateValue(employee);
      const lateDiff = hrLateHours === null ? "N/A" : Number((softwareLateHours - hrLateHours).toFixed(2));
      const lateCategory = getLateCategory(lateDiff);

      // 3. OT (Hours)
      let softwareOTMinutes = overtimeGrandTotals.get(employee.empCode);
      if (softwareOTMinutes === undefined) {
        softwareOTMinutes = calculateFinalOT(
          employee,
          getGrantForEmployee,
          getFullNightOTForEmployee,
          getCustomTimingForEmployee,
          isMaintenanceEmployee
        );
      }
      const softwareOTHours = Number((softwareOTMinutes / 60).toFixed(2));
      const hrOTHours = getHROTValue(employee);
      const otDiff = hrOTHours === null ? "N/A" : Number((softwareOTHours - hrOTHours).toFixed(2));
      const otCategory = getOTCategory(otDiff);

      return {
        srNo: index + 1,
        empCode: employee.empCode,
        empName: employee.empName,
        company: employee.companyName,
        softwarePresentDays,
        hrPresentDays,
        presentDaysDiff,
        presentDaysCategory,
        softwareLateHours,
        hrLateHours,
        lateDiff,
        lateCategory,
        softwareOTHours,
        hrOTHours,
        otDiff,
        otCategory,
      };
    });
  }, [
    excelData,
    presentDayTotals,
    totalMinus4,
    overtimeGrandTotals,
    employeeFinalDifferences,
    baseHolidaysCount,
    selectedHolidaysCount,
    getPL,
    getGrantForEmployee,
    getFullNightOTForEmployee,
    getCustomTimingForEmployee,
    isMaintenanceEmployee,
    getHRPresentDays,
    getHRLateValue,
    getHROTValue,
    getLunchDataForEmployee,
  ]);

  const sortedData = useMemo(() => {
    if (data.length === 0) return [];
    const sorted = [...data];
    sorted.sort((a, b) => {
      const { key, direction } = sortConfig;
      let aVal: any = a[key];
      let bVal: any = b[key];

      // Handle N/A for sorting
      if (aVal === "N/A") aVal = direction === "asc" ? Infinity : -Infinity;
      if (bVal === "N/A") bVal = direction === "asc" ? Infinity : -Infinity;

      if (typeof aVal === "string" && typeof bVal === "string") {
        return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return direction === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [data, sortConfig]);

  const requestSort = (key: SortColumn) => {
    let direction: SortDirection = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: SortColumn) => {
    if (sortConfig.key !== key) return <div className="flex flex-col ml-1 text-gray-300"><ArrowUp size={10} /><ArrowDown size={10} /></div>;
    return (
      <div className="flex flex-col ml-1">
        <ArrowUp size={10} className={sortConfig.direction === "asc" ? "text-gray-900" : "text-gray-300"} />
        <ArrowDown size={10} className={sortConfig.direction === "desc" ? "text-gray-900" : "text-gray-300"} />
      </div>
    );
  };

  const getCellClass = (category: DifferenceCategory) => {
    switch (category) {
      case "Major": return "bg-red-100 text-red-800 font-bold";
      case "Medium": return "bg-orange-100 text-orange-800 font-semibold";
      case "Minor": return "bg-yellow-50 text-yellow-800";
      case "Match": return "bg-green-50 text-green-800";
      default: return "";
    }
  };

  const handleScrollToEmployee = (empCode: string) => {
    const element = document.getElementById(`employee-${empCode}`);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      element.classList.add("ring-4", "ring-indigo-400");
      setTimeout(() => {
        element.classList.remove("ring-4", "ring-indigo-400");
      }, 2000);
    }
  };

  if (!excelData) return null;

  return (
    <div className="mt-8 pt-6 border-t border-gray-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-4">
          <button
            onClick={() => setShowTable(!showTable)}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold shadow-md hover:bg-indigo-700 transition-all"
          >
            {showTable ? "Hide Unified Comparison" : "Show Unified Comparison Table"}
            {showTable ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>

          {showTable && (
            <>
              <button
                onClick={() => exportUnifiedComparisonToExcel(sortedData)}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-bold shadow-md hover:bg-green-700 transition-all"
              >
                Export All to Excel
                <ArrowDown size={20} />
              </button>

              <button
                onClick={() => exportMajorMediumDifferences(sortedData)}
                className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg font-bold shadow-md hover:bg-orange-700 transition-all"
              >
                Export Major/Medium Issues
                <ArrowDown size={20} />
              </button>
            </>
          )}
        </div>
      </div>

      {showTable && (
        <div className="overflow-x-auto rounded-lg shadow border border-gray-200">
          <table className="min-w-full bg-white text-sm">
            <thead className="bg-gray-100 text-gray-700 uppercase font-bold">
              <tr>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-200" onClick={() => requestSort("srNo")}>
                  <div className="flex items-center">Sr No {getSortIcon("srNo")}</div>
                </th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-200" onClick={() => requestSort("empCode")}>
                  <div className="flex items-center">Emp Code {getSortIcon("empCode")}</div>
                </th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-200" onClick={() => requestSort("empName")}>
                  <div className="flex items-center">Emp Name {getSortIcon("empName")}</div>
                </th>

                {/* Present Days */}
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-200 bg-blue-50" onClick={() => requestSort("softwarePresentDays")}>
                  <div className="flex items-center justify-end">Soft. Days {getSortIcon("softwarePresentDays")}</div>
                </th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-200 bg-blue-50" onClick={() => requestSort("hrPresentDays")}>
                  <div className="flex items-center justify-end">HR Days {getSortIcon("hrPresentDays")}</div>
                </th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-200 bg-blue-100" onClick={() => requestSort("presentDaysDiff")}>
                  <div className="flex items-center justify-end">Diff {getSortIcon("presentDaysDiff")}</div>
                </th>

                {/* Late */}
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-200 bg-orange-50" onClick={() => requestSort("softwareLateHours")}>
                  <div className="flex items-center justify-end">Soft. Late {getSortIcon("softwareLateHours")}</div>
                </th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-200 bg-orange-50" onClick={() => requestSort("hrLateHours")}>
                  <div className="flex items-center justify-end">HR Late {getSortIcon("hrLateHours")}</div>
                </th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-200 bg-orange-100" onClick={() => requestSort("lateDiff")}>
                  <div className="flex items-center justify-end">Diff {getSortIcon("lateDiff")}</div>
                </th>

                {/* OT */}
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-200 bg-green-50" onClick={() => requestSort("softwareOTHours")}>
                  <div className="flex items-center justify-end">Soft. OT {getSortIcon("softwareOTHours")}</div>
                </th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-200 bg-green-50" onClick={() => requestSort("hrOTHours")}>
                  <div className="flex items-center justify-end">HR OT {getSortIcon("hrOTHours")}</div>
                </th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-200 bg-green-100" onClick={() => requestSort("otDiff")}>
                  <div className="flex items-center justify-end">Diff {getSortIcon("otDiff")}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedData.map((row) => (
                <tr key={row.empCode} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{row.srNo}</td>
                  <td className="px-4 py-2 font-medium">
                    <button
                      onClick={() => handleScrollToEmployee(row.empCode)}
                      className="text-blue-600 hover:text-blue-800 hover:underline text-left"
                    >
                      {row.empCode}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleScrollToEmployee(row.empCode)}
                      className="text-blue-600 hover:text-blue-800 hover:underline text-left"
                    >
                      {row.empName}
                    </button>
                  </td>

                  {/* Present Days */}
                  <td className="px-4 py-2 text-right bg-blue-50/30">{row.softwarePresentDays}</td>
                  <td className="px-4 py-2 text-right bg-blue-50/30">{row.hrPresentDays ?? "-"}</td>
                  <td className={`px-4 py-2 text-right ${getCellClass(row.presentDaysCategory)}`}>{row.presentDaysDiff}</td>

                  {/* Late */}
                  <td className="px-4 py-2 text-right bg-orange-50/30">{row.softwareLateHours}</td>
                  <td className="px-4 py-2 text-right bg-orange-50/30">{row.hrLateHours ?? "-"}</td>
                  <td className={`px-4 py-2 text-right ${getCellClass(row.lateCategory)}`}>{row.lateDiff}</td>

                  {/* OT */}
                  <td className="px-4 py-2 text-right bg-green-50/30">{row.softwareOTHours}</td>
                  <td className="px-4 py-2 text-right bg-green-50/30">{row.hrOTHours ?? "-"}</td>
                  <td className={`px-4 py-2 text-right ${getCellClass(row.otCategory)}`}>{row.otDiff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
