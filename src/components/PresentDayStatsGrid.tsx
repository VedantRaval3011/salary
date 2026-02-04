"use client";

import React, { useEffect, useMemo, useState } from "react";
import { EmployeeData } from "@/lib/types";
import { useExcel } from "../context/ExcelContext";
import { useFinalDifference } from "@/context/FinalDifferenceContext";
import { useHRDataLookup } from "@/hooks/useHRDataLookup";

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
      leave?: number
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

    const getPL = (emp: Pick<EmployeeData, "empCode" | "empName">): { paidDays: number; adjDays: number; leaveDays: number } => {
      const raw = canon(emp.empCode);
      const s1 = stripNonAlnum(raw);
      const num = numericOnly(raw);
      const no0 = dropLeadingZeros(num);
      const pads = [4, 5, 6].map((w) => num.padStart(w, "0"));
      const candidates = [raw, s1, num, no0, ...pads];
      for (const k of candidates) {
        const hit = byKey.get(k);
        if (hit) return {
          paidDays: hit.paidDays ?? 0,
          adjDays: hit.adjDays ?? 0,
          leaveDays: hit.leave ?? 0  // ADD THIS LINE
        };
      }
      const foundByName = byName.get(nameKey(emp.empName)) ?? [];
      if (foundByName.length === 1) {
        return {
          paidDays: foundByName[0].paidDays ?? 0,
          adjDays: foundByName[0].adjDays ?? 0,
          leaveDays: foundByName[0].leave ?? 0  // ADD THIS LINE
        };
      }
      return { paidDays: 0, adjDays: 0, leaveDays: 0 };  // UPDATE THIS LINE
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
        /(\d{1,2})(?::(\d{2}))?\s*TO\s*(\d{1,2})(?::(\d{2}))?/i
      );

      if (match) {
        const startHour = parseInt(match[1]);
        const startMin = parseInt(match[2] || "0");
        
        let endHour = parseInt(match[3]);
        const endMin = parseInt(match[4] || "0");

        // PM Adjustment Logic
        if (endHour < startHour) endHour += 12;
        if (endHour <= 12 && startHour < 8) endHour += 12;
        
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

// ---- Component ---- //
interface Props {
  employee: EmployeeData;
  baseHolidaysCount?: number;
  selectedHolidaysCount?: number;
  finalDifference?: number;
  lateDeductionDays?: number;
  onTotalCalculated?: (total: number) => void;
}

const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + (minutes || 0);
};

export const PresentDayStatsGrid: React.FC<Props> = ({
  employee,
  baseHolidaysCount = 0,
  selectedHolidaysCount = 0,
  finalDifference = 0,
  lateDeductionDays = 0,
  onTotalCalculated,
}) => {
  const { getPL } = usePaidLeaveLookup();
  const { lateDeductionOverride } = useFinalDifference();

  const { getGrantForEmployee } = useStaffOTGrantedLookup();
  const { getFullNightOTForEmployee } = useFullNightOTLookup();
  const { getCustomTimingForEmployee } = useCustomTimingLookup();
  const { isMaintenanceEmployee } = useMaintenanceDeductLookup();
  const { getHRPresentDays } = useHRDataLookup();

  const stats = useMemo(() => {
    let paCount = 0;
    let fullPresentDays = 0;
    let adjPresentDays = 0;

    employee.days?.forEach((day) => {
      const status = (day.attendance.status || "").toUpperCase();

      // Check for ADJ-P half day (treat as P/A)
      let isAdjPHalfDay = false;
      if (status === "ADJ-P") {
        const workHours = day.attendance.workHrs || 0;
        let workMins = 0;
        if (typeof workHours === "string" && workHours.includes(":")) {
          const [h, m] = workHours.split(":").map(Number);
          workMins = h * 60 + (m || 0);
        } else if (!isNaN(Number(workHours))) {
          workMins = Number(workHours) * 60;
        }
        if (workMins === 0 && day.attendance.inTime && day.attendance.outTime && day.attendance.inTime !== "-" && day.attendance.outTime !== "-") {
          const inM = timeToMinutes(day.attendance.inTime);
          const outM = timeToMinutes(day.attendance.outTime);
          if (outM > inM) {
            workMins = outM - inM;
          }
        }

        // Updated threshold to 320 minutes (5h 20m) to match AttendanceGrid logic
        if (workMins > 0 && workMins <= 320) {
          isAdjPHalfDay = true;
        }
      }

      // Handle Adjusted Day variants (count as Present)
      // ✅ STRICT RULE: Only "Adjusted" days count as Present.
      // Pure OT days (WO-I, M/WO-I) should NOT count as Present.
      if (
        status === "ADJ-M/WO-I" ||
        status === "ADJ-M"
      ) {
        const inTime = day.attendance.inTime;
        const outTime = day.attendance.outTime;

        if (inTime && inTime !== "-" && outTime && outTime !== "-") {
          // Calculate work hours to determine if half day or full day
          const inMinutes = timeToMinutes(inTime);
          const outMinutes = timeToMinutes(outTime);
          const workMinutes =
            outMinutes > inMinutes ? outMinutes - inMinutes : 0;

          if (workMinutes > 0 && workMinutes <= 240) {
            // Half day (up to 4 hours)
            paCount++;
          } else if (workMinutes > 240) {
            // Full day (more than 4 hours)
            fullPresentDays++;
          }
        }
      } else if (status === "P") {
        // ✅ STRICT RULE: For Staff, Saturday "P" is usually OT, not a "Present Day" for salary.
        // Unless it's a regular working day for them (which "P" implies), but user request says:
        // "if the employee was present in saturday , then the OT must be calcualted , but it must not be considered in the Present After adjustment"
        const dayName = (day.day || "").toLowerCase();
        const isSaturday = dayName === "sa" || dayName === "sat";

        if (isStaff && isSaturday) {
             // Do NOT count as Present (it's OT)
        } else {
             fullPresentDays++;
        }
      } else if (status === "P/A" || status === "PA" || status === "ADJ-P/A" || status === "ADJP/A" || isAdjPHalfDay) {
        paCount++;
      } else if (status === "ADJ-P") {
        const inTime = day.attendance.inTime;
        const outTime = day.attendance.outTime;
        if (inTime && inTime !== "-" && outTime && outTime !== "-") {
          adjPresentDays++;
        }
      }
    });

    const PD_excel = employee.present || 0;
    const paAdjustment = paCount * 0.5;
    const PAA = fullPresentDays + adjPresentDays + paAdjustment;
    // Check for C CASH EMPLOYEE - Force Holidays to 0
    const isCashEmployee = (employee.department || "").toUpperCase().includes("C CASH EMPLOYEE");
    const H_base = isCashEmployee ? 0 : (selectedHolidaysCount || baseHolidaysCount || 0);

    let validHolidays = 0;
    const days = employee.days || [];

    const isAbsentOrNA = (status: string): boolean => {
      const normalized = status.toUpperCase().trim();
      return (
        normalized === "A" || normalized === "NA" || normalized === "ABSENT"
      );
    };

    const isHolidayOrSpecial = (status: string): boolean => {
      const normalized = status.toUpperCase().trim();
      return (
        normalized === "H" ||
        normalized === "ADJ-M/WO-I" ||
        normalized === "ADJ-M" ||
        normalized === "WO-I"
      );
    };

    let i = 0;
    while (i < days.length) {
      const currentStatus = (days[i].attendance.status || "")
        .toUpperCase()
        .trim();

      if (isHolidayOrSpecial(currentStatus)) {
        const blockStart = i;
        let blockEnd = i;

        while (
          blockEnd < days.length &&
          isHolidayOrSpecial(
            (days[blockEnd].attendance.status || "").toUpperCase().trim()
          )
        ) {
          blockEnd++;
        }
        blockEnd--;

        let prevStatus = null;
        for (let j = blockStart - 1; j >= 0; j--) {
          const pStatus = (days[j].attendance.status || "")
            .toUpperCase()
            .trim();
          if (!isHolidayOrSpecial(pStatus)) {
            prevStatus = pStatus;
            break;
          }
        }

        let nextStatus = null;
        for (let j = blockEnd + 1; j < days.length; j++) {
          const nStatus = (days[j].attendance.status || "")
            .toUpperCase()
            .trim();
          if (!isHolidayOrSpecial(nStatus)) {
            nextStatus = nStatus;
            break;
          }
        }

        const isSandwiched =
          prevStatus !== null &&
          nextStatus !== null &&
          isAbsentOrNA(prevStatus) &&
          isAbsentOrNA(nextStatus);

        if (!isSandwiched) {
          for (let j = blockStart; j <= blockEnd; j++) {
            const blockStatus = (days[j].attendance.status || "")
              .toUpperCase()
              .trim();
            if (blockStatus === "H") {
              validHolidays++;
            }
          }
        }

        i = blockEnd + 1;
      } else {
        i++;
      }
    }



    const customTiming = getCustomTimingForEmployee(employee);
    let lateMinsTotal = 0;
    let wasOTDeducted = false;

    const isStaff = getIsStaff(employee);
    const isWorker = !isStaff;

    const STANDARD_START_MINUTES = 8 * 60 + 30;
    const EVENING_SHIFT_START_MINUTES = 13 * 60 + 15;
    const MORNING_EVENING_CUTOFF_MINUTES = 10 * 60;
    const PERMISSIBLE_LATE_MINS = 5;

    const employeeNormalStartMinutes =
      customTiming?.expectedStartMinutes ?? STANDARD_START_MINUTES;

    employee.days?.forEach((day) => {
      const status = (day.attendance.status || "").toUpperCase();
      const inTime = day.attendance.inTime;

      if (!inTime || inTime === "-") {
        return;
      }

      // Check for ADJ-P half day (treat as P/A)
      let isAdjPHalfDay = false;
      if (status === "ADJ-P") {
        const workHours = day.attendance.workHrs || 0;
        let workMins = 0;
        if (typeof workHours === "string" && workHours.includes(":")) {
          const [h, m] = workHours.split(":").map(Number);
          workMins = h * 60 + (m || 0);
        } else if (!isNaN(Number(workHours))) {
          workMins = Number(workHours) * 60;
        }
        if (workMins === 0 && day.attendance.inTime && day.attendance.outTime && day.attendance.inTime !== "-" && day.attendance.outTime !== "-") {
          const inM = timeToMinutes(day.attendance.inTime);
          const outM = timeToMinutes(day.attendance.outTime);
          if (outM > inM) {
            workMins = outM - inM;
          }
        }

        if (workMins > 0 && workMins <= 240) {
          isAdjPHalfDay = true;
        }
      }

      const inMinutes = timeToMinutes(inTime);
      let dailyLateMins = 0;

      if (status === "P/A" || status === "PA" || isAdjPHalfDay) {
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

      if (dailyLateMins > PERMISSIBLE_LATE_MINS) {
        lateMinsTotal += dailyLateMins;
      }
    });

    const Late_hours = Number((lateMinsTotal / 60).toFixed(2));

    let AdditionalOT = lateDeductionDays;
    let OT_hours = 0;
    let totalOTMinutes = 0;
    let customTimingOTMinutes = 0;

    const grant = getGrantForEmployee(employee);

    const parseMinutes = (val?: string | number | null): number => {
      if (!val) return 0;
      const str = String(val).trim();
      if (str.includes(":")) {
        const [h, m] = str.split(":").map((x) => parseInt(x) || 0);
        return h * 60 + m;
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

    if (grant) {
      const fromD = Number(grant.fromDate) || 1;
      const toD = Number(grant.toDate) || 31;

      employee.days?.forEach((day) => {
        const dateNum = Number(day.date) || 0;
        if (dateNum >= fromD && dateNum <= toD) {
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
    } else {
      employee.days?.forEach((day) => {
        const dayName = (day.day || "").toLowerCase();
        const status = (day.attendance.status || "").toUpperCase();

        if (dayName === "sa" && status !== "ADJ-P") {
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
    }

    if (isWorker && !grant) {
      totalOTMinutes = 0;
      customTimingOTMinutes = 0;
      employee.days?.forEach((day) => {
        const status = (day.attendance.status || "").toUpperCase();
        if (status !== "ADJ-P") {
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
    }

    const fullNightOTHours = getFullNightOTForEmployee(employee);
    if (fullNightOTHours > 0) {
      const fullNightMinutes = fullNightOTHours * 60;
      totalOTMinutes += fullNightMinutes;
    }

    if (isMaintenanceEmployee(employee)) {
      totalOTMinutes = totalOTMinutes * 0.95;
      wasOTDeducted = true;
    }

    OT_hours = Number((totalOTMinutes / 60).toFixed(2));
    const customTimingOTHours = Number((customTimingOTMinutes / 60).toFixed(2));

    const netTotal = PAA + (isCashEmployee ? 0 : validHolidays) - lateDeductionDays;
    const ATotal = Math.max(netTotal, 0);

    // Get paid leave data (both regular paid days and adj days)
    const plData = getPL(employee);
    const pl = plData.paidDays || 0;
    const adjDays = plData.adjDays || 0;
    const leaveDays = plData.leaveDays || 0;

    // Calculate grand total including both paid days and adj days
    const GrandTotal = Math.max(ATotal + pl + adjDays + leaveDays, 0);

    // Corrected: Total = Present After Adj + Holidays (Base)
    const Total = PAA + (isCashEmployee ? 0 : validHolidays);


    return {
      PD_excel,
      PAA: Number(PAA.toFixed(1)),
      H_base,
      Total: Number(Total.toFixed(1)),
      Late_hours,
      OT_hours,
      AdditionalOT: Number(AdditionalOT.toFixed(1)),
      ATotal: Number(ATotal.toFixed(1)),
      PL_days: pl,
      ADJ_days: adjDays, // NEW: Include adj days from paid leave sheet
      GrandTotal: Number(GrandTotal.toFixed(1)),
      paCount,
      adjPresentDays,
      fullNightOTHours,
      customTimingOTHours,
      wasOTDeducted,
      Leave_days: leaveDays,
      lateDeductionDays: Number(lateDeductionDays.toFixed(1)),
    };
  }, [
    employee,
    baseHolidaysCount,
    selectedHolidaysCount,
    getPL,
    getGrantForEmployee,
    getFullNightOTForEmployee,
    getCustomTimingForEmployee,
    isMaintenanceEmployee,
    lateDeductionDays,
  ]);

  // Effect to notify parent of Total calculation
  // We send GrandTotal to match the fallback logic in PresentDayComparison
  useEffect(() => {
    if (onTotalCalculated) {
      onTotalCalculated(stats.GrandTotal);
    }
  }, [stats.GrandTotal, onTotalCalculated]);

  // Get HR Present Days for this employee
  const hrPresentDays = getHRPresentDays(employee);

  // Calculate Difference (HR Total - Grand Total)
  const difference = hrPresentDays !== null ? hrPresentDays - stats.GrandTotal : null;

  const tooltipTexts: any = {
    PD_excel: "Present days counted directly from attendance sheet.",
    PAA: "Present days after adjustment: Full Present days + ADJ-P days + (P/A days × 0.5).",
    H_base: "Holidays selected from Holiday Management.",
    Total: "Present After Adj + Holidays (Base)",
    AdditionalOT:
      "Deduction (in days) applied when Late Hours > Final OT. If Final OT < 4 hrs, deduction is 0.5 days. Otherwise, 0.5 days per 4-hour block.",
    ATotal: "Adjusted total considering OT deduction rules.",
    PL_days: "Paid Leave taken from Staff Paid Leave Sheet.",
    ADJ_days: "Adjustment Days from Staff Paid Leave Sheet (ADJ. DAYS column).",
    GrandTotal: "A Total + Paid Leave + Adjustment Days + Leave Days",
    lateDeduction: "Deduction (in days) applied based on Static Final Difference from Early Departure Stats Grid.",
    Leave_days: "Leave days from Staff Paid Leave Sheet (LEAVE column).",
    HRGrandTotal: "HR Grand Total from Tulsi file (Worker/Staff)",
  };

  const StatBox = ({ label, value, bgColor, textColor, tooltipKey }: any) => (
    <div
      className={`relative text-center p-2 w-[120px] ${bgColor} rounded-md border ${textColor} transition-all hover:shadow`}
      title={tooltipTexts[tooltipKey]}
    >
      <div className="text-[10px] text-gray-600">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <span className="text-indigo-600">📊</span>
          Present Day Calculation
        </h4>

        <div className="flex items-center gap-3">
          {/* HR Total - Small Box */}
          <div className="px-4 py-2 bg-yellow-100 border-2 border-yellow-400 rounded-lg">
            <div className="text-xs text-yellow-700 font-semibold">HR Total</div>
            <div className="text-lg font-bold text-yellow-900">
              {hrPresentDays !== null ? hrPresentDays : "N/A"}
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
                {Number(difference.toFixed(2))}
              </div>
            </div>
          )}
        </div>
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

        <StatBox
          label="Late Deduction"
          value={lateDeductionDays}
          bgColor="bg-red-50"
          textColor="text-red-700 border-red-300"
          tooltipKey="lateDeduction"
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
        {stats.ADJ_days > 0 && (
          <StatBox
            label="ADJ Days (from PL)"
            value={stats.ADJ_days}
            bgColor="bg-amber-50"
            textColor="text-amber-700"
            tooltipKey="ADJ_days"
          />
        )}
        <StatBox
          label="Leave (from PL)"
          value={stats.Leave_days}
          bgColor="bg-pink-50"
          textColor="text-pink-700"
          tooltipKey="Leave_days"
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