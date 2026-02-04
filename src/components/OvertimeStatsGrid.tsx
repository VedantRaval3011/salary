"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { EmployeeData } from "@/lib/types";
import { useExcel } from "@/context/ExcelContext";
import { useFinalDifference } from "@/context/FinalDifferenceContext";
import { useGrandOT } from "@/context/GrandOTContext";
import { useHROTLookup } from "@/hooks/useHROTLookup";

interface Props {
  employee: EmployeeData;
  onGrandTotalCalculated?: (total: number) => void;
  onStaticFinalDifferenceCalculated?: (staticDiff: number) => void;
  lateDeductionDays?: number;
}

// Utility helpers
const canon = (s: string) => (s ?? "").toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");
const nameKey = (s: string) => stripNonAlnum(s);

// Helper to check if employee is Staff or Worker
const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${emp.department ?? ""
    }`.toLowerCase();
  if (inStr.includes("c cash")) return false;
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  return true; // Default to staff
};

// Helper to convert time string to minutes
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + (minutes || 0);
};

// Helper to convert minutes to HH:MM string
const minutesToHHMM = (totalMinutes: number): string => {
  if (isNaN(totalMinutes) || totalMinutes <= 0) return "0:00";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
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

// ---- Full Night Stay OT Lookup Hook ---- //
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

// ---- 09 to 06 Custom Timing Lookup Hook ---- //
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

      if (!found && numCodeK) {
        found = employeeByCode.get(numCodeK);
      }

      if (!found) {
        found = employeeByName.get(empNameK);
      }

      if (!found) return null;

      const timeStr = found.customTime || "9:00 TO 6:00";
      const match = timeStr.match(
        /(\d{1,2}):(\d{2})\s*TO\s*(\d{1,2}):(\d{2})/i
      );

      if (match) {
        const rawStartHour = parseInt(match[1], 10);
        const startMin = parseInt(match[2] || "0", 10);

        const rawEndHour = parseInt(match[3], 10);
        const endMin = parseInt(match[4] || "0", 10);

        let startHour = rawStartHour;
        let endHour = rawEndHour;

        // ✅ If times are in 1–12 range and endHour <= startHour,
        // assume end time is in the afternoon/evening (PM).
        // So "9:00 TO 6:00" becomes 9:00 → 18:00, not 6:00 AM.
        if (
          startHour >= 1 && startHour <= 12 &&
          endHour >= 1 && endHour <= 12 &&
          endHour <= startHour
        ) {
          endHour += 12;
        }

        const expectedStartMinutes = startHour * 60 + startMin;
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

// ---- Staff OT Granted Lookup Hook ---- //
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

      let found = byCode.get(empCodeK);

      if (!found && numCodeK) {
        found = byNumericCode.get(numCodeK);
      }

      if (!found) {
        found = byName.get(empNameK);
      }

      return found;
    };

    return { getGrantForEmployee };
  }, [getAllUploadedFiles]);
}

// ---- Maintenance OT Deduct Lookup Hook ---- //
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

    let maintenanceEmployees: any[] = [];
    if (
      deductFile.data?.employees &&
      Array.isArray(deductFile.data.employees)
    ) {
      maintenanceEmployees = deductFile.data.employees;
    } else {
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

export const OvertimeStatsGrid: React.FC<Props> = ({
  employee,
  onGrandTotalCalculated,
  onStaticFinalDifferenceCalculated,
  lateDeductionDays = 0,
}) => {
  const { setGrandOT } = useGrandOT();
  const lastGrandTotalRef = useRef<number | null>(null);
  const { getGrantForEmployee } = useStaffOTGrantedLookup();
  const { getFullNightOTForEmployee } = useFullNightOTLookup();
  const { getCustomTimingForEmployee } = useCustomTimingLookup();
  const { isMaintenanceEmployee } = useMaintenanceDeductLookup();
  const { getHROTValue } = useHROTLookup();
  const { lateDeductionOverride, originalFinalDifference } =
    useFinalDifference();

  // original FD before recursion
  const baseFinalDifference =
    originalFinalDifference.get(employee.empCode) ?? 0;

  // Key fixes in the OT calculation logic:
  // Key fixes in the OT calculation logic:

  const stats = useMemo(() => {
    // SPECIAL RULE: Kalpesh Raloliya (143) always has 0 OT
    if (employee.empCode === "143" || employee.empName?.toLowerCase().includes("kalpesh raloliya")) {
      return {
        baseOTValue: "0:00",
        staffGrantedOTMinutes: 0,
        staffNonGrantedOTMinutes: 0,
        workerGrantedOTMinutes: 0,
        worker9to6OTMinutes: 0,
        grantedFromSheetStaffMinutes: 0,
        totalMinutes: 0,
        fullNightOTInMinutes: 0,
        lateDeductionHours: 0,
        grandTotalMinutes: 0,
        lateMinsTotal: 0,
        wasOTDeducted: false,
        isStaff: getIsStaff(employee),
        isWorker: !getIsStaff(employee),
      };
    }

    const customTiming = getCustomTimingForEmployee(employee);
    const isStaff = getIsStaff(employee);
    const isWorker = !isStaff;
    const grant = getGrantForEmployee(employee);

    const ADJ_P_BUFFER_MINUTES = 30;
    const ADJ_P_SHIFT_END_MINUTES = 17 * 60 + 30;
    const ADJ_P_CUTOFF_MINUTES = ADJ_P_SHIFT_END_MINUTES + ADJ_P_BUFFER_MINUTES;

    // Use custom timing if available
    const employeeNormalEndMinutes =
      customTiming?.expectedEndMinutes ?? (17 * 60 + 30);

    let grantedFromSheetStaffMinutes = 0;
    let staffGrantedOTMinutes = 0;
    let staffNonGrantedOTMinutes = 0;
    let workerGrantedOTMinutes = 0;
    let worker9to6OTMinutes = 0;

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

    const getOtFieldMinutes = (attendanceObj: any) => {
      // ⚠️ CRITICAL FIX: Do NOT fall back to workHrs/workHours
      // Those fields represent TOTAL work time, not overtime
      const otField = attendanceObj.otHours ?? attendanceObj.otHrs ??
        attendanceObj.ot ?? null;
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

        // ⭐ FIXED: Calculate custom timing OT FIRST, use it for all statuses
        if (customTiming) {
          dayOTMinutes = calculateCustomTimingOT(outTime, customTiming.expectedEndMinutes);
        }
        // Only recalculate for ADJ-P if custom timing didn't apply
        else if (status === "ADJ-P") {
          if (isStaff) {
            dayOTMinutes = 0;
          } else {
            if (outTime && outTime !== "-") {
              const outMin = timeToMinutes(outTime);
              dayOTMinutes = outMin > employeeNormalEndMinutes ? outMin - employeeNormalEndMinutes : 0;
            }
          }
        }
        // Otherwise use OT field
        else {
          dayOTMinutes = getOtFieldMinutes(day.attendance);
        }

        grantedFromSheetStaffMinutes += dayOTMinutes;
      });
    } else {
      // Employee NOT in OT Granted list
      if (isStaff) {
        // Staff Granted OT (Saturdays/Holidays)
        employee.days?.forEach((day) => {
          const dayName = (day.day || "").toLowerCase();
          const status = (day.attendance.status || "").toUpperCase();
          const outTime = day.attendance.outTime;

            // Saturday OT for Staff — include WO, M/WO, ADJ-M variants (e.g. "M/WO-I", "ADJ-M/WO-I")
          if (
            dayName === "sa" &&
            !status.includes("ADJ-P") && // still exclude ADJ-P
            (status.includes("WO") || status.includes("ADJ-M"))
          ) {
            // ✅ FIXED: For Saturday/Holiday OT (M/WO-I etc), usually use the sheet value.
            // BUT for Adjusted Days (ADJ-M/WO-I, M/WO-I), they are treated as normal working days -> 0 OT.
            if (
              status === "ADJ-M/WO-I" ||
              status === "M/WO-I" ||
              status === "WO-I" ||
              status === "ADJ-M"
            ) {
               // Treated as normal working day for staff -> 0 OT
               // Do not add anything
            } else {
               const dayOTMinutes = getOtFieldMinutes(day.attendance);
               staffGrantedOTMinutes += dayOTMinutes;
            }
            return;
          }


          // ADJ-P handling
          if (status === "ADJ-P") {
            return; // Staff gets 0 OT for ADJ-P
          }

          // Other holiday statuses (match variants like "M/WO-I", "ADJ-M/WO-I")
          if (status.includes("WO-I") || status.includes("ADJ-M") || status.includes("WO")) {
            // ✅ FIXED: Same here — use sheet value for holidays, BUT exclude Adjusted Days
             if (
              status === "ADJ-M/WO-I" ||
              status === "M/WO-I" ||
              status === "WO-I" ||
              status === "ADJ-M"
            ) {
               // Treated as working day -> 0 OT
            } else {
                const dayOTMinutes = getOtFieldMinutes(day.attendance);
                staffGrantedOTMinutes += dayOTMinutes;
            }
            return;
          }

        });

        // Staff Non Granted OT (Working Days)
        employee.days?.forEach((day) => {
          const dayName = (day.day || "").toLowerCase();
          const status = (day.attendance.status || "").toUpperCase();

          if (dayName !== "sa" && status !== "ADJ-P" && status !== "ADJ-M" && status !== "WO-I") {
            let dayOTMinutes = 0;

            // ✅ FIXED: Use custom timing consistently
            if (customTiming) {
              dayOTMinutes = calculateCustomTimingOT(day.attendance.outTime, customTiming.expectedEndMinutes);
            } else {
              dayOTMinutes = getOtFieldMinutes(day.attendance);
            }

            staffNonGrantedOTMinutes += dayOTMinutes;
          }
        });
      } else if (isWorker) {
        // Worker OT (All days)
        employee.days?.forEach((day) => {
          const dayName = (day.day || "").toLowerCase();
          const status = (day.attendance.status || "").toUpperCase();
          const outTime = day.attendance.outTime;
          let dayOTMinutes = 0;

          // ⭐ NEW — count Saturday WO/M/WO-I as OT for Workers too
          if (
            dayName === "sa" &&
            (status.includes("WO") || status.includes("M/WO"))
          ) {
            // For WO/M/WO-I on Saturday, use the sheet's OT value directly.
            // Custom timing logic (Out - End) is for regular days and would incorrectly return ~0 here.
            dayOTMinutes = getOtFieldMinutes(day.attendance);

            workerGrantedOTMinutes += dayOTMinutes;
            return;
          }

          // ✅ FIXED: Custom timing takes precedence
          if (customTiming) {
            dayOTMinutes = calculateCustomTimingOT(day.attendance.outTime, customTiming.expectedEndMinutes);
            if (dayOTMinutes > 0) {
              worker9to6OTMinutes += dayOTMinutes;
            }
          }
          // ADJ-P with buffer
          else if (status === "ADJ-P") {
            const outTime = day.attendance.outTime;
            if (outTime && outTime !== "-") {
              const outMinutes = timeToMinutes(outTime);
              const bufferEnd = employeeNormalEndMinutes + ADJ_P_BUFFER_MINUTES;

              if (outMinutes > bufferEnd) {
                dayOTMinutes = outMinutes - employeeNormalEndMinutes;
              }
            }
          }
          // ⚠️ CRITICAL: Only use OT field for non-custom-timing days
          // Do NOT count this for custom timing employees (already calculated above)
          else if (!customTiming) {
            dayOTMinutes = getOtFieldMinutes(day.attendance);
          }

          workerGrantedOTMinutes += dayOTMinutes;
        });
      }
    }

    // Calculate totals
    const totalMinutes = grantedFromSheetStaffMinutes + staffGrantedOTMinutes;
    const fullNightOTDecimalHours = getFullNightOTForEmployee(employee);
    const fullNightOTInMinutes = Math.round(fullNightOTDecimalHours * 60);

    // Base total before full night OT & deductions
    const lateDeductionMinutes = Math.round(lateDeductionDays * 480);

    let grossTotalMinutes = 0;
    if (isStaff) {
      grossTotalMinutes = staffGrantedOTMinutes + grantedFromSheetStaffMinutes;
    } else {
      grossTotalMinutes = workerGrantedOTMinutes;
    }

    // Grand total BEFORE 5% maintenance deduction
    const preDeductionGrandTotal =
      grossTotalMinutes + fullNightOTInMinutes + lateDeductionMinutes;

    let grandTotalMinutes = preDeductionGrandTotal;
    let wasOTDeducted = false;

    // ✅ Apply 5% deduction on the *entire* grand total OT (incl. Full Night + late adj)
    if (isMaintenanceEmployee(employee)) {
      grandTotalMinutes = preDeductionGrandTotal * 0.95;
      wasOTDeducted = true;
    }

    return {
      baseOTValue: employee.totalOTHours || "0:00",
      staffGrantedOTMinutes: Math.round(staffGrantedOTMinutes),
      staffNonGrantedOTMinutes: Math.round(staffNonGrantedOTMinutes),
      workerGrantedOTMinutes: Math.round(workerGrantedOTMinutes),
      worker9to6OTMinutes: Math.round(worker9to6OTMinutes),
      grantedFromSheetStaffMinutes: Math.round(grantedFromSheetStaffMinutes),
      totalMinutes: Math.round(grossTotalMinutes),
      fullNightOTInMinutes: Math.round(fullNightOTInMinutes),
      lateDeductionHours: Number((lateDeductionMinutes / 60).toFixed(1)),
      grandTotalMinutes: Math.round(grandTotalMinutes),
      lateMinsTotal: 0, // Not calculated in this component
      wasOTDeducted,
      isStaff,
      isWorker,
    };
  }, [
    employee,
    getGrantForEmployee,
    getFullNightOTForEmployee,
    getCustomTimingForEmployee,
    isMaintenanceEmployee,
    lateDeductionDays,
  ]);

  useEffect(() => {
    if (!onGrandTotalCalculated) return;

    if (lastGrandTotalRef.current !== stats.grandTotalMinutes) {
      lastGrandTotalRef.current = stats.grandTotalMinutes;
      onGrandTotalCalculated(stats.grandTotalMinutes);
    }
  }, [stats.grandTotalMinutes, onGrandTotalCalculated]);

  // write the employee's grand total into GrandOTContext when it changes
  useEffect(() => {
    // skip if empCode missing
    if (!employee?.empCode) return;
    // stats.grandTotalMinutes is the value we want to publish
    setGrandOT(employee.empCode, stats.grandTotalMinutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.grandTotalMinutes, employee?.empCode]);

  // Notify parent of static final difference (Total + Full Night OT)
  useEffect(() => {
    if (!onStaticFinalDifferenceCalculated) return;

    const staticDiff = stats.totalMinutes + stats.fullNightOTInMinutes;
    onStaticFinalDifferenceCalculated(staticDiff);
  }, [
    stats.totalMinutes,
    stats.fullNightOTInMinutes,
    onStaticFinalDifferenceCalculated,
  ]);

  const tooltipTexts: any = {
    baseOT:
      "The raw 'OT Hours' total from the main attendance sheet (HH:MM format).",
    staffGrantedOT:
      "OT calculated only from Saturdays, holidays ('ADJ-P', 'ADJ-M', 'WO-I') for Staff employees not in the Granted list.",
    staffNonGrantedOT:
      "OT calculated from all normal working days (excluding Saturdays, holidays, ADJ-P, ADJ-M, WO-I) for Staff employees.",
    workerGrantedOT:
      "OT calculated for all days for Worker employees, including special handling for ADJ-P on Saturdays. This is the main OT for Workers.",
    worker9to6OT:
      "Portion of OT calculated from custom timing (e.g., 9:00 to 6:00) for Workers in the 9 to 6 sheet.",
    grantedFromSheet:
      "OT calculated for all days within the specified 'From Date' to 'To Date' period for Staff employees *found in the Granted OT sheet*.",
    total:
      "Total = Granted From Sheet (Staff) + Staff Granted OT. This is the final OT *before* Full Night OT and Deduction.",
    fullNightOT: "Total OT hours from 'Full Night Stay' sheet (in minutes).",
    lateDeduction:
      "Deduction (in days) applied when Late Hours > Final Calculated OT. Deduction is 0.5 days per 4-hour difference. Max deduction is based on Final OT.",
    grandTotal:
      "Grand Total = (Total or Worker Granted OT) + Full Night OT + Late Deduction (in minutes)",
  };

  const StatBox = ({ label, value, bgColor, textColor, tooltipKey }: any) => {
    let displayValue = value;
    let suffix = "";
    let minutesDisplay = "";

    if (tooltipKey === "lateDeduction") {
      suffix = " hrs";
      displayValue = value; // value will now be hours
      minutesDisplay = `${Math.round(value * 60)} mins`;
    } else if (tooltipKey === "baseOT") {
      suffix = "";
      displayValue = value;
      const mins = timeToMinutes(value);
      minutesDisplay = `${mins} mins`;
    } else {
      suffix = "";
      displayValue = minutesToHHMM(value);
      minutesDisplay = `${value} mins`;
    }

    return (
      <div
        className={`relative text-center p-2 w-[130px] ${bgColor} rounded-md border ${textColor} transition-all hover:shadow-lg`}
      >
        <div className="text-[10px] font-medium text-gray-600 mb-1">
          {label}
        </div>
        <div className="text-xl font-bold mt-1">
          {displayValue}
          {suffix}
        </div>
        {minutesDisplay && (
          <div className="text-[10px] text-gray-500 mt-0.5">
            {minutesDisplay}
          </div>
        )}
      </div>
    );
  };

  const hrOTValue = getHROTValue(employee);
  const grandTotalHours = stats.grandTotalMinutes / 60;
  const difference = hrOTValue != null ? hrOTValue - grandTotalHours : null;

  return (
    <div className="mt-6 pt-4 border-t-2 border-gray-300">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <span className="text-indigo-600">📊 Overtime (OT) Calculation</span>
        </h4>

        <div className="flex items-center gap-3">
          {/* HR OT Grand Total - Small Box */}
          <div className="px-4 py-2 bg-amber-100 border-2 border-amber-400 rounded-lg">
            <div className="text-xs text-amber-700 font-semibold">
              HR OT (Tulsi)
            </div>
            <div className="text-lg font-bold text-amber-900">
              {hrOTValue != null ? `${hrOTValue.toFixed(2)} hrs` : "N/A"}
            </div>
          </div>

          {/* Difference Box */}
          {difference !== null && (
            <div
              className={`px-4 py-2 border-2 rounded-lg ${Math.abs(difference) > 0.02
                ? "bg-red-100 border-red-400"
                : "bg-green-100 border-green-400"
                }`}
            >
              <div
                className={`text-xs font-semibold ${Math.abs(difference) > 0.02
                  ? "text-red-700"
                  : "text-green-700"
                  }`}
              >
                Difference
              </div>
              <div
                className={`text-lg font-bold ${Math.abs(difference) > 0.02
                  ? "text-red-900"
                  : "text-green-900"
                  }`}
              >
                {difference > 0 ? "+" : ""}
                {difference.toFixed(2)} hrs
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {Math.round(difference * 60)} mins
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MAIN LAYOUT - Two rows */}
      <div className="flex flex-wrap  justify-start gap-2">
        {/* Column 1: Base OT */}
        <div className="flex flex-col gap-2">
          <StatBox
            label="Base OT (From Excel)"
            value={stats.baseOTValue}
            bgColor="bg-gray-50"
            textColor="text-gray-800 border-gray-300"
            tooltipKey="baseOT"
          />
        </div>

        {/* Column 2: Staff Granted OT + Staff Non Granted OT */}
        <div className="flex flex-col gap-4">
          <StatBox
            label="Staff Granted OT"
            value={stats.staffGrantedOTMinutes}
            bgColor="bg-orange-50"
            textColor="text-orange-700 border-orange-300"
            tooltipKey="staffGrantedOT"
          />
          <StatBox
            label="Staff Non Granted OT"
            value={stats.staffNonGrantedOTMinutes}
            bgColor="bg-amber-50"
            textColor="text-amber-700 border-amber-300"
            tooltipKey="staffNonGrantedOT"
          />
        </div>

        {/* Column 3: Worker Granted OT + Worker 9 to 6 OT */}
        <div className="flex flex-col gap-4">
          <StatBox
            label="Worker Granted OT"
            value={stats.workerGrantedOTMinutes}
            bgColor="bg-orange-50"
            textColor="text-orange-700 border-orange-300"
            tooltipKey="workerGrantedOT"
          />
          <StatBox
            label="Worker 9 to 6 OT"
            value={stats.worker9to6OTMinutes}
            bgColor="bg-purple-50"
            textColor="text-purple-700 border-purple-300"
            tooltipKey="worker9to6OT"
          />
        </div>

        {/* Column 4: Granted From Sheet (Staff) */}
        <div className="flex flex-col gap-2">
          <StatBox
            label="Granted Sheet (Staff)"
            value={stats.grantedFromSheetStaffMinutes}
            bgColor="bg-blue-50"
            textColor="text-blue-700 border-blue-300"
            tooltipKey="grantedFromSheet"
          />
        </div>

        {/* Column 5: Total */}
        <div className="flex flex-col gap-4">
          <StatBox
            label="Total"
            value={stats.totalMinutes}
            bgColor="bg-cyan-50"
            textColor="text-cyan-700 border-cyan-300"
            tooltipKey="total"
          />
        </div>

        {/* Column 6: Full Night OT */}
        <div className="flex flex-col gap-4">
          <StatBox
            label="Full Night OT"
            value={stats.fullNightOTInMinutes}
            bgColor="bg-indigo-50"
            textColor="text-indigo-700 border-indigo-300"
            tooltipKey="fullNightOT"
          />
        </div>

        {/* Column 7: Late Deduction */}
        <div className="flex flex-col gap-4">
          <StatBox
            label="Late Deduction"
            value={stats.lateDeductionHours}
            bgColor="bg-red-50"
            textColor="text-red-700 border-red-300"
            tooltipKey="lateDeduction"
          />
        </div>

        {/* Column 8: Grand Total */}
        <div className="flex flex-col gap-4">
          <StatBox
            label="Grand Total"
            value={stats.grandTotalMinutes}
            bgColor="bg-green-50"
            textColor="text-green-700 border-green-400"
            tooltipKey="grandTotal"
          />
        </div>
      </div>

      {/* INFO MESSAGES */}
      <div className="mt-6 space-y-2">
        {stats.worker9to6OTMinutes > 0 && (
          <div className="text-xs text-purple-700 italic bg-purple-50 p-2 rounded border border-purple-200">
            * Worker 9 to 6 OT ({minutesToHHMM(stats.worker9to6OTMinutes)} /{" "}
            {stats.worker9to6OTMinutes} mins) is included in Worker Granted OT
          </div>
        )}
        {stats.wasOTDeducted && (
          <div className="text-xs text-red-700 italic bg-red-50 p-2 rounded border border-red-200">
            * **5% OT deduction applied** (Maintenance Employee)
          </div>
        )}
      </div>
    </div>
  );
};
