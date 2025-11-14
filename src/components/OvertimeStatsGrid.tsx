"use client";

import React, { useEffect, useMemo, useState } from "react";
import { EmployeeData } from "@/lib/types";
import { useExcel } from "@/context/ExcelContext";

interface Props {
  employee: EmployeeData;
  onGrandTotalCalculated?: (total: number) => void;
}

// Utility helpers
const canon = (s: string) => (s ?? "").toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");
const nameKey = (s: string) => stripNonAlnum(s);

// Helper to check if employee is Staff or Worker
const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${
    emp.department ?? ""
  }`.toLowerCase();
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  return true; // default to staff
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

// ---- Component ---- //
interface Props {
  employee: EmployeeData;
}

export const OvertimeStatsGrid: React.FC<Props> = ({
  employee,
  onGrandTotalCalculated,
}) => {
  const [tooltips, setTooltips] = useState<{ [k: string]: boolean }>({});
  const { getGrantForEmployee } = useStaffOTGrantedLookup();
  const { getFullNightOTForEmployee } = useFullNightOTLookup();
  const { getCustomTimingForEmployee } = useCustomTimingLookup();
  const { isMaintenanceEmployee } = useMaintenanceDeductLookup();

  const stats = useMemo(() => {
    const customTiming = getCustomTimingForEmployee(employee);
    let lateMinsTotal = 0;
    let wasOTDeducted = false;

    const STANDARD_START_MINUTES = 8 * 60 + 30;
    const EVENING_SHIFT_START_MINUTES = 12 * 60 + 45;
    const MORNING_EVENING_CUTOFF_MINUTES = 10 * 60;
    const PERMISSIBLE_LATE_MINS = 5;

    const employeeNormalStartMinutes =
      customTiming?.expectedStartMinutes ?? STANDARD_START_MINUTES;

    // Calculate Late Minutes
    employee.days?.forEach((day) => {
      const status = (day.attendance.status || "").toUpperCase();
      const inTime = day.attendance.inTime;

      if (!inTime || inTime === "-") {
        return;
      }

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

    const baseOTValue = employee.totalOTHours || "0:00";
    const grant = getGrantForEmployee(employee);
    const isStaff = getIsStaff(employee);
    const isWorker = !isStaff;

    const parseMinutes = (val?: string | number | null): number => {
      if (!val) return 0;
      const str = String(val).trim();
      if (str.includes(":")) {
        return timeToMinutes(str);
      }
      const decimalHours = parseFloat(str);
      if (!isNaN(decimalHours)) {
        return Math.round(decimalHours * 60);
      }
      return 0;
    };

    const calculateCustomTimingOT = (
      outTime: string,
      expectedEndMinutes: number
    ): number => {
      if (!outTime || outTime === "-") return 0;
      const outMinutes = timeToMinutes(outTime);
      const otMinutes =
        outMinutes > expectedEndMinutes ? outMinutes - expectedEndMinutes : 0;
      return otMinutes < 5 ? 0 : otMinutes;
    };

    // Initialize OT variables
    let staffGrantedOTMinutes = 0; // Staff OT on Sat/Holiday when NOT in granted sheet
    let staffNonGrantedOTMinutes = 0; // Staff OT on working days (Mon-Fri) when NOT in granted sheet
    let workerGrantedOTMinutes = 0; // Worker OT for all days
    let worker9to6OTMinutes = 0;
    let grantedFromSheetStaffMinutes = 0; // Staff OT when IN granted sheet

    if (grant) {
      const fromD = Number(grant.fromDate) || 1;
      const toD = Number(grant.toDate) || 31;

      employee.days?.forEach((day) => {
        const dateNum = Number(day.date) || 0;
        if (dateNum < fromD || dateNum > toD) return;

        const status = (day.attendance.status || "").toUpperCase();
        const outTime = day.attendance.outTime;
        let dayOTMinutes = 0;

        // 1) Custom timing (if present)
        if (customTiming) {
          dayOTMinutes = calculateCustomTimingOT(
            outTime,
            customTiming.expectedEndMinutes
          );
        }

        // 2) ADJ-P override → OT after 6:00 PM only
        else if (status === "ADJ-P") {
          if (outTime && outTime !== "-") {
            const outMin = timeToMinutes(outTime);
            const cutoff = 18 * 60; // 6:00 PM
            dayOTMinutes = outMin > cutoff ? outMin - cutoff : 0;
          } else {
            dayOTMinutes = 0;
          }
        }

        // 3) Normal day → use OT column
        else {
          const otField =
            (day.attendance as any).otHours ??
            (day.attendance as any).otHrs ??
            (day.attendance as any).ot ??
            (day.attendance as any).workHrs ??
            (day.attendance as any).workHours ??
            null;

          dayOTMinutes = parseMinutes(otField);
        }

        // Cap at 9 hours max
        const cappedOT = Math.min(dayOTMinutes, 540);

        // This employee is STAFF → add here
        grantedFromSheetStaffMinutes += cappedOT;
      });
    } else {
      // Employee is NOT in OT Granted list
      if (isStaff) {
        // Staff Granted OT (Saturdays/Holidays) - logic for Staff NOT in granted sheet
        employee.days?.forEach((day) => {
          const dayName = (day.day || "").toLowerCase();
          const status = (day.attendance.status || "").toUpperCase();

          // OT for Saturday (Sa) and Holidays (ADJ-P means holiday pay applied)
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
            staffGrantedOTMinutes += cappedOT;
          }
        });

        // Staff Non Granted OT (Working Days) - for Staff NOT in granted sheet
        employee.days?.forEach((day) => {
          const dayName = (day.day || "").toLowerCase();
          const status = (day.attendance.status || "").toUpperCase();

          // Exclude Saturdays, Holidays, ADJ-P, ADJ-M, WO-I
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
            staffNonGrantedOTMinutes += cappedOT;
          }
        });
      } else if (isWorker) {
        // Worker Granted OT (All days) - Worker logic is simplified to sum all OT
        employee.days?.forEach((day) => {
          const status = (day.attendance.status || "").toUpperCase();
          const dayName = (day.day || "").toLowerCase();

          let dayOTMinutes = 0;

          // Case 1: Custom timing applies (9 to 6)
          if (customTiming) {
            dayOTMinutes = calculateCustomTimingOT(
              day.attendance.outTime,
              customTiming.expectedEndMinutes
            );
            if (dayOTMinutes > 0) {
              worker9to6OTMinutes += dayOTMinutes; // Track 9-6 OT separately
            }
          }
          // ADJ-P OT rule → OT after 6:00 PM (5:30 PM + 30 min buffer)
          else if (status === "ADJ-P") {
            const outTime = day.attendance.outTime;
            if (outTime && outTime !== "-") {
              const outMinutes = timeToMinutes(outTime);

              const cutoff = 18 * 60; // 6:00 PM = 1080 mins

              if (outMinutes > cutoff) {
                dayOTMinutes = outMinutes - cutoff;
              } else {
                dayOTMinutes = 0;
              }
            }
          }

          // Case 3: Normal OT field
          else {
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
          workerGrantedOTMinutes += cappedOT;
        });
      }
    }

    // Calculate Total for Staff
    // Total is only for Staff when OT is GRANTED from a sheet
    const totalMinutes = grantedFromSheetStaffMinutes + staffGrantedOTMinutes;

    // Full Night OT
    const fullNightOTDecimalHours = getFullNightOTForEmployee(employee);
    const fullNightOTInMinutes = Math.round(fullNightOTDecimalHours * 60);

    // Final OT for deduction check and Grand Total
    let finalOTForDeduction = 0;

    if (isStaff) {
      finalOTForDeduction = totalMinutes;
    } else if (isWorker) {
      finalOTForDeduction = workerGrantedOTMinutes;
    }

    // Apply maintenance deduction if applicable (5% deduction)
    if (isMaintenanceEmployee(employee)) {
      finalOTForDeduction = finalOTForDeduction * 0.95;
      wasOTDeducted = true;
    }

    // Late Deduction calculation
    let lateDeductionDays = 0;

    if (finalOTForDeduction < lateMinsTotal) {
      const finalOTInHours = finalOTForDeduction / 60;
      if (finalOTInHours < 4) {
        lateDeductionDays = 0.5;
      } else {
        const diffInHours = (lateMinsTotal - finalOTForDeduction) / 60;
        // Deduction is 0.5 days per 4-hour difference
        lateDeductionDays = 0.5 * Math.floor(diffInHours / 4);
        // Ensure minimum deduction is 0.5 days if deduction is warranted
        if (lateDeductionDays === 0 && diffInHours > 0) {
          lateDeductionDays = 0.5;
        }
      }
    }

    // Convert late deduction days to minutes (8 hours per day)
    const lateDeductionMinutes = lateDeductionDays * 8 * 60;

    // Calculate Grand Total
    let grandTotalMinutes = 0;
    if (isStaff) {
      // Grand Total = Total + Full night OT - Late Deduction (in minutes)
      grandTotalMinutes =
        totalMinutes + fullNightOTInMinutes - lateDeductionMinutes;
    } else if (isWorker) {
      // Grand Total = Worker Granted OT + Full Night OT - Late Deduction (in minutes)
      grandTotalMinutes =
        workerGrantedOTMinutes + fullNightOTInMinutes - lateDeductionMinutes;
    }

    // Grand Total cannot be negative
    grandTotalMinutes = Math.max(0, grandTotalMinutes);

    return {
      baseOTValue,
      staffGrantedOTMinutes: Math.round(staffGrantedOTMinutes),
      staffNonGrantedOTMinutes: Math.round(staffNonGrantedOTMinutes),
      workerGrantedOTMinutes: Math.round(workerGrantedOTMinutes),
      worker9to6OTMinutes: Math.round(worker9to6OTMinutes),
      grantedFromSheetStaffMinutes: Math.round(grantedFromSheetStaffMinutes),
      totalMinutes: Math.round(totalMinutes),
      fullNightOTInMinutes: Math.round(fullNightOTInMinutes),
      lateDeductionHours: Number((lateDeductionDays * 8).toFixed(1)),
      grandTotalMinutes: Math.round(grandTotalMinutes),
      lateMinsTotal: Math.round(lateMinsTotal),
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
  ]);

  useEffect(() => {
    if (onGrandTotalCalculated) {
      onGrandTotalCalculated(stats.grandTotalMinutes);
    }
  }, [stats.grandTotalMinutes, onGrandTotalCalculated]);

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
      "Grand Total = (Total or Worker Granted OT) + Full Night OT - Late Deduction (in minutes)",
  };

  const StatBox = ({ label, value, bgColor, textColor, tooltipKey }: any) => {
    let displayValue = value;
    let suffix = "";
    let minutesDisplay = "";

    if (tooltipKey === "lateDeduction") {
      suffix = " hrs";
      displayValue = value; // value will now be hours
    } else if (tooltipKey === "baseOT") {
      suffix = "";
      displayValue = value;
    } else {
      suffix = "";
      displayValue = minutesToHHMM(value);
      minutesDisplay = `(${value} mins)`;
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
          <div className="text-sm text-gray-500 mt-0.5">{minutesDisplay}</div>
        )}
      </div>
    );
  };

  return (
    <div className="mt-6 pt-4 border-t-2 border-gray-300">
      <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
        <span className="text-indigo-600">📊 Overtime (OT) Calculation</span>
      </h4>

      {/* MAIN LAYOUT - Two rows */}
      <div className="flex flex-wrap gap-4 justify-center">
        {/* Column 1: Base OT */}
        <div className="flex flex-col gap-4">
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
        <div className="flex flex-col gap-4">
          <StatBox
            label="Granted From Sheet (Staff)"
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
        {stats.lateMinsTotal > 0 && (
          <div className="text-xs text-gray-700 bg-gray-50 p-2 rounded border border-gray-200">
            * Total Late Minutes: {minutesToHHMM(stats.lateMinsTotal)} (
            {stats.lateMinsTotal} mins)
          </div>
        )}
      </div>
    </div>
  );
};
