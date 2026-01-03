// components/AttendanceGrid.tsx
"use client";

import React, { useMemo } from "react";
import { DayAttendance, EmployeeData } from "@/lib/types";
import { useExcel } from "@/context/ExcelContext";
import { usePunchData } from "@/context/PunchDataContext";
import { useMaintenanceDeductLookup } from "@/hooks/useMaintenanceDeductLookup";
import { useStaffOTGrantedLookup } from "@/hooks/useStaffOTGrantedLookup";

interface AttendanceGridProps {
  days: DayAttendance[];
  employeeIndex?: number;
  onAdjustmentClick?: (date: number) => void;
  customTime?: string; // e.g., "9:00 TO 6:00"
  isOTGranted?: boolean;
  employee: EmployeeData;
}

// --- Helper Functions ---
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + (minutes || 0);
};

const formatTime = (timeStr: string): string => {
  if (!timeStr) return "-";
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  }
  return timeStr;
};

// --- Lunch In/Out Lookup Hook (Copied & Simplified) ---
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

    if (!lunchFile) return { getLunchDataForEmployee: () => null };

    let lunchEmployees: any[] = [];
    if (
      (lunchFile as any).processedData &&
      Array.isArray((lunchFile as any).processedData)
    ) {
      lunchEmployees = (lunchFile as any).processedData.map((record: any) => ({
        empCode: record.empCode,
        empName: record.empName,
        dailyPunches: Object.entries(record.attendance || {}).map(
          ([date, att]: [string, any]) => ({
            date,
            punches: [
              ...(att.in || []).map((time: string) => ({ type: "In", time })),
              ...(att.out || []).map((time: string) => ({ type: "Out", time })),
            ].sort((a, b) => {
              const timeA = a.time.split(":").map(Number);
              const timeB = b.time.split(":").map(Number);
              return timeA[0] * 60 + timeA[1] - (timeB[0] * 60 + timeB[1]);
            }),
          })
        ),
      }));
    } else if (
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
    }

    const normalizeSpaces = (s: string) =>
      (s ?? "").replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ");
    const cleanName = (s: string) =>
      normalizeSpaces(s ?? "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[^A-Z0-9 ]/g, "");

    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";

    const employeeByCode = new Map<string, any>();
    const employeeByName = new Map<string, any>();

    for (const emp of lunchEmployees) {
      if (emp.empCode) {
        const raw = String(emp.empCode).trim();
        const codeKey = cleanName(raw);
        const numKey = numOnly(raw);
        const no0 = numKey.replace(/^0+/, "");
        const variants = new Set([
          codeKey,
          numKey,
          no0,
          numKey.padStart(4, "0"),
          numKey.padStart(5, "0"),
          numKey.padStart(6, "0"),
          raw.toUpperCase().trim(),
        ]);
        variants.forEach((k) => employeeByCode.set(k, emp));
      }
      if (emp.empName) {
        const base = cleanName(emp.empName);
        employeeByName.set(base, emp);
        employeeByName.set(base.replace(/\s+/g, ""), emp);
      }
    }

    const getLunchDataForEmployee = (
      emp: Pick<EmployeeData, "empCode" | "empName">
    ): any => {
      if (!emp) return null;
      const rawCode = (emp.empCode ?? "").toString().trim();
      const rawName = (emp.empName ?? "").toString().trim();
      const empCodeKey = cleanName(rawCode);
      const empCodeNum = numOnly(rawCode);
      const empNameKey = cleanName(rawName);
      const empNameKeyNoSpace = empNameKey.replace(/\s+/g, "");

      let found = null;
      if (!found && empCodeKey) found = employeeByCode.get(empCodeKey);
      if (!found && empCodeNum) found = employeeByCode.get(empCodeNum);
      if (!found) found = employeeByCode.get(rawCode.toUpperCase().trim());
      if (!found && empNameKey) found = employeeByName.get(empNameKey);
      if (!found && empNameKeyNoSpace)
        found = employeeByName.get(empNameKeyNoSpace);

      return found || null;
    };

    return { getLunchDataForEmployee };
  }, [getAllUploadedFiles]);
}

// --- Break Rules (Copied) ---
const BREAKS = [
  { name: "Tea Break 1", start: 10 * 60 + 15, end: 10 * 60 + 30, allowed: 15 }, // 10:15 - 10:30
  { name: "Lunch Break", start: 12 * 60 + 30, end: 14 * 60, allowed: 30 },      // 12:30 - 14:00
  { name: "Tea Break 2", start: 15 * 60 + 15, end: 15 * 60 + 30, allowed: 15 }, // 15:15 - 15:30
  { name: "Dinner Break", start: 19 * 60 + 30, end: 21 * 60, allowed: 30 },     // 19:30 - 21:00
];



// Helper to check if employee is Staff or Worker
const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${emp.department ?? ""
    }`.toLowerCase();
  // Check for explicit worker keywords (including c cash) FIRST
  if (inStr.includes("c cash")) return false;
  if (inStr.includes("worker")) return false;
  // Check for explicit staff keywords
  if (inStr.includes("staff")) return true;
  // ⭐ Default to STAFF (true) to match unifiedCalculations
  return true;
};

export const AttendanceGrid: React.FC<AttendanceGridProps> = ({
  days,
  employeeIndex,
  onAdjustmentClick,
  customTime,
  isOTGranted,
  employee,
}) => {
  const { getPunchDataForEmployee } = usePunchData();
  const { getGrantForEmployee } = useStaffOTGrantedLookup();
  const { isMaintenanceEmployee } = useMaintenanceDeductLookup();
  const isMaintenance = isMaintenanceEmployee(employee);

  // --- Compute Daily Punches for this Employee from PunchData Context ---
  const dailyPunchesMap = useMemo(() => {
    const punchData = getPunchDataForEmployee(employee.empCode);
    const map = new Map<string, any[]>();

    console.log("AttendanceGrid: Punch Data for", employee.empCode, punchData);

    if (punchData && punchData.attendance) {
      // Iterate through all dates in the punch data
      Object.entries(punchData.attendance).forEach(([dateKey, dayData]) => {
        const ins = dayData.in || [];
        const outs = dayData.out || [];

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

        // Helper to set map with multiple key variants
        const setMap = (k: string) => {
          map.set(k, cleanedPunches);
        };

        setMap(dateKey);

        // Try to handle "01", "02" vs "1", "2"
        if (dateKey.match(/^\d{1,2}$/)) {
          // It's a simple number like "1", "10", "05"
          const num = parseInt(dateKey, 10).toString(); // "1", "10", "5"
          setMap(num);
          setMap(num.padStart(2, '0'));
        }

        // Handle ISO Date: YYYY-MM-DD -> extract DD
        const isoMatch = dateKey.match(/^\d{4}-\d{2}-(\d{2})/);
        if (isoMatch) {
          const dayPart = isoMatch[1];
          setMap(dayPart); // "01"
          setMap(dayPart.replace(/^0/, "")); // "1"
        }

        // Handle DD-Mon-YYYY (e.g. 10-Nov-2023)
        const datePartsMatch = dateKey.match(/^(\d{1,2})[-\s\/]([A-Za-z]+)[-\s\/]/);
        if (datePartsMatch) {
          const dayPart = datePartsMatch[1];
          setMap(dayPart);
          setMap(dayPart.padStart(2, '0'));
          setMap(dayPart.replace(/^0/, ""));
        }

        // Handle DD/MM/YYYY or DD-MM-YYYY (Numeric)
        const numericDateMatch = dateKey.match(/^(\d{1,2})[-\s\/](\d{1,2})[-\s\/](\d{2,4})/);
        if (numericDateMatch) {
          const dayPart = numericDateMatch[1];
          setMap(dayPart);
          setMap(dayPart.padStart(2, '0'));
          setMap(dayPart.replace(/^0/, ""));
        }
      });
    }
    return map;
  }, [employee.empCode, getPunchDataForEmployee]);

  // Parse custom timing to get start and end times
  const parseCustomTime = (timeStr: string | undefined) => {
    if (!timeStr) return null;
    const match = timeStr.match(
      /(\d{1,2})(?::(\d{2}))?\s*TO\s*(\d{1,2})(?::(\d{2}))?/i
    );
    if (!match) return null;
    let startHour = parseInt(match[1]);
    const startMin = parseInt(match[2] || "0");
    let endHour = parseInt(match[3]);
    const endMin = parseInt(match[4] || "0");
    if (endHour < startHour) endHour += 12;
    if (endHour <= 12 && startHour < 8) endHour += 12;
    return { startHour, startMin, endHour, endMin };
  };

  const recalculateOTHours = (
    inTime: string,
    outTime: string,
    customTiming: ReturnType<typeof parseCustomTime>
  ): string => {
    if (
      !customTiming ||
      !inTime ||
      !outTime ||
      inTime === "-" ||
      outTime === "-"
    )
      return "0:00";
    const timeToMinutes = (t: string): number => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + (m || 0);
    };
    const outMinutes = timeToMinutes(outTime);
    const expectedEndMinutes = customTiming.endHour * 60 + customTiming.endMin;
    const otMinutes =
      outMinutes > expectedEndMinutes ? outMinutes - expectedEndMinutes : 0;
    if (otMinutes < 5) return "0:00";
    const hrs = Math.floor(otMinutes / 60);
    const mins = otMinutes % 60;
    return `${hrs}:${mins.toString().padStart(2, "0")}`;
  };

  const recalculateLateMinutes = (
    inTime: string,
    customTiming: ReturnType<typeof parseCustomTime>
  ): number => {
    if (!customTiming || !inTime || inTime === "-") return 0;
    const inMinutes = timeToMinutes(inTime);
    const expectedStartMinutes =
      customTiming.startHour * 60 + customTiming.startMin;

    // STRICT CUSTOM TIMING: Always compare against expected start
    const lateMins = inMinutes - expectedStartMinutes;
    return lateMins > 0 ? lateMins : 0;
  };

  const customTimingParsed = parseCustomTime(customTime);

  // Get employee type and grant status
  const isStaff = getIsStaff(employee);
  const isWorker = !isStaff;
  const grant = getGrantForEmployee(employee);

  // Helper to parse OT minutes from various formats
  const parseOTMinutes = (val?: string | number | null): number => {
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

  // Helper to calculate OT for a specific day
  const calculateDayOT = (day: DayAttendance): number => {
    const status = (day.attendance.status || "").toUpperCase();
    const dayName = (day.day || "").toLowerCase();
    const outTime = day.attendance.outTime;
    const dateNum = Number(day.date) || 0;

    // ADJ-P special handling: OT only after 6:00 PM (5:30 PM + 30 min buffer)
    if (status === "ADJ-P" || status === "ADJ-P/A" || status === "ADJP/A") {
      if (isStaff) return 0;

      if (outTime && outTime !== "-") {
        const outMinutes = timeToMinutes(outTime);
        const ADJ_P_SHIFT_END = 17 * 60 + 30; // 17:30
        const ADJ_P_BUFFER = 30; // minutes
        const ADJ_P_BUFFER_END = ADJ_P_SHIFT_END + ADJ_P_BUFFER; // 18:00

        if (outMinutes > ADJ_P_BUFFER_END) {
          return outMinutes - ADJ_P_SHIFT_END;
        } else {
          return 0;
        }
      }
      return 0;
    }

    // If employee has grant, check date range
    if (grant) {
      const fromD = Number(grant.fromDate) || 1;
      const toD = Number(grant.toDate) || 31;

      if (dateNum >= fromD && dateNum <= toD) {
        // Use OT field from attendance
        const otField =
          (day.attendance as any).otHours ??
          (day.attendance as any).otHrs ??
          (day.attendance as any).ot ??
          null;
        return parseOTMinutes(otField);
      }
      return 0; // Outside grant date range
    }

    // Staff without grant: only Saturdays and special statuses
    if (isStaff) {
      if (dayName === "sa" && status !== "ADJ-P") {
        const otField =
          (day.attendance as any).otHours ??
          (day.attendance as any).otHrs ??
          (day.attendance as any).ot ??
          null;
        return parseOTMinutes(otField);
      }

      if (status === "WO-I" || status === "ADJ-M") {
        const otField =
          (day.attendance as any).otHours ??
          (day.attendance as any).otHrs ??
          (day.attendance as any).ot ??
          null;
        return parseOTMinutes(otField);
      }

      return 0; // Staff: no OT on regular working days without grant
    }

    // Worker: all days (except ADJ-P which is handled above)
    if (isWorker && status !== "ADJ-P") {
      const otField =
        (day.attendance as any).otHours ??
        (day.attendance as any).otHrs ??
        (day.attendance as any).ot ??
        null;
      return parseOTMinutes(otField);
    }

    return 0;
  };

  const processedDays = days.map((day) => {
    // SPECIAL RULE: Kaplesh Raloliya (143) always has 0 Late
    const isKaplesh = employee.empCode === "143" || employee.empName?.toLowerCase().includes("kaplesh");

    let status = (day.attendance.status || "").toUpperCase();

    // Check for ADJ-P half day -> change to ADJ-P/A
    if (status === "ADJ-P" || status === "ADJP") {
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

      if (workMins > 0 && workMins <= 320) {
        status = "ADJ-P/A";
        // Update day object immediately so subsequent logic uses new status
        day = {
          ...day,
          attendance: {
            ...day.attendance,
            status: "ADJ-P/A",
          },
        };
      }
    }

    // Recalculate Early Departure for P/A statuses
    let originalEarlyDep = day.attendance.earlyDep;
    let hasEarlyDepCalculation = false;

    if (status === "P/A" || status === "PA" || status === "ADJ-P/A" || status === "ADJP/A") {
      const outTime = day.attendance.outTime;
      if (outTime && outTime !== "-") {
        const outMinutes = timeToMinutes(outTime);
        const TARGET_EXIT_MINUTES = 12 * 60 + 45; // 12:45

        if (outMinutes < TARGET_EXIT_MINUTES) {
          const newEarlyDep = TARGET_EXIT_MINUTES - outMinutes;
          if (String(newEarlyDep) !== String(originalEarlyDep || "0")) {
            hasEarlyDepCalculation = true;
            day = {
              ...day,
              attendance: {
                ...day.attendance,
                earlyDep: newEarlyDep.toString()
              }
            };
          }
        } else {
          if (String(originalEarlyDep || "0") !== "0") {
            hasEarlyDepCalculation = true;
            day = {
              ...day,
              attendance: {
                ...day.attendance,
                earlyDep: "0"
              }
            };

          }
        }
      }
    }

    // ⭐ Recalculate Early Departure for Custom Timing employees (P status)
    if (customTimingParsed && (status === "P" || status === "ADJ-P")) {
      const outTime = day.attendance.outTime;
      if (outTime && outTime !== "-") {
        const outMinutes = timeToMinutes(outTime);
        const expectedEndMinutes = customTimingParsed.endHour * 60 + customTimingParsed.endMin;

        if (outMinutes < expectedEndMinutes) {
          const newEarlyDep = expectedEndMinutes - outMinutes;
          if (String(newEarlyDep) !== String(originalEarlyDep || "0")) {
            hasEarlyDepCalculation = true;
            day = {
              ...day,
              attendance: {
                ...day.attendance,
                earlyDep: newEarlyDep.toString()
              }
            };
          }
        } else {
          // Left on time or late - set early dep to 0
          if (String(originalEarlyDep || "0") !== "0") {
            hasEarlyDepCalculation = true;
            day = {
              ...day,
              attendance: {
                ...day.attendance,
                earlyDep: "0"
              }
            };
          }
        }
      }
    }

    let hasOTCalculation = false;
    let originalOTValue = "";
    let calculatedOTMinutes = 0;

    // Check if we should calculate OT for this day
    const shouldCalculateOT =
      (status === "P" || status === "ADJ-P" || status === "WO-I" || status === "ADJ-M" || status === "ADJ-P/A" || status === "ADJP/A") &&
      day.attendance.outTime &&
      day.attendance.outTime !== "-";

    if (shouldCalculateOT) {
      // Get original OT value
      originalOTValue = String(
        (day.attendance as any).otHours ??
        (day.attendance as any).otHrs ??
        (day.attendance as any).ot ??
        "0:00"
      );

      // Calculate OT based on rules
      calculatedOTMinutes = calculateDayOT(day);

      // Convert to HH:MM format
      const calculatedOTHrs = calculatedOTMinutes > 0
        ? `${Math.floor(calculatedOTMinutes / 60)}:${(calculatedOTMinutes % 60).toString().padStart(2, "0")}`
        : "0:00";

      // Check if values differ
      const originalMinutes = parseOTMinutes(originalOTValue);
      if (originalMinutes !== calculatedOTMinutes) {
        hasOTCalculation = true;
      }

      // Update day with calculated OT
      day = {
        ...day,
        attendance: {
          ...day.attendance,
          otHrs: calculatedOTHrs,
        },
      };
    }

    // Handle P/A status late minutes override
    let originalLateMinsForPA: string | undefined = undefined;
    let hasLateOverride = false;
    const isPAStatus = status === "P/A" || status === "PA" ||
      status === "ADJ-P/A" || status === "ADJP/A" || status === "ADJ-PA";

    if (isPAStatus && !isKaplesh) {
      const currentLateMins = String(day.attendance.lateMins || "0");
      const inTime = day.attendance.inTime;

      if (inTime && inTime !== "-") {
        const inMinutes = timeToMinutes(inTime);
        const dayName = (day.day || "").toLowerCase();
        const isSaturday = dayName === "sa" || dayName === "sat" || dayName === "saturday";

        let calculatedLateMins = 0;

        // P/A: Use morning/evening cutoff logic for ALL days (not just Saturday)
        // Morning shift: before 10:00 AM cutoff → late from 8:30 AM
        // Afternoon shift: after 10:00 AM cutoff → late from 1:15 PM
        const MORNING_EVENING_CUTOFF_MINUTES = 10 * 60; // 10:00 AM
        const HALF_DAY_START_MINUTES = 13 * 60 + 15; // 1:15 PM (second shift start)
        const employeeNormalStartMinutes = 8 * 60 + 30; // 8:30 AM

        if (inMinutes < MORNING_EVENING_CUTOFF_MINUTES) {
          // Morning shift P/A - late from standard start time (8:30 AM)
          if (inMinutes > employeeNormalStartMinutes) {
            calculatedLateMins = inMinutes - employeeNormalStartMinutes;
          }
        } else {
          // Afternoon shift P/A - late from 1:15 PM (second shift start)
          if (inMinutes > HALF_DAY_START_MINUTES) {
            calculatedLateMins = inMinutes - HALF_DAY_START_MINUTES;
          }
          // If between 10:00 AM and 1:15 PM, late is 0 (arrived on time for afternoon shift)
        }

        // Apply 5-minute grace period
        const PERMISSIBLE_LATE_MINS = 5;
        if (calculatedLateMins > PERMISSIBLE_LATE_MINS) {
          calculatedLateMins = calculatedLateMins;
        } else {
          calculatedLateMins = 0;
        }

        const calculatedLateStr = String(Math.round(calculatedLateMins));

        // If calculated value differs from Excel value, override it
        if (calculatedLateStr !== currentLateMins) {
          originalLateMinsForPA = currentLateMins;
          hasLateOverride = true;
          day = {
            ...day,
            attendance: {
              ...day.attendance,
              lateMins: calculatedLateStr,
            },
          };
        }
      }
    }

    // Handle custom timing recalculation
    if (!customTimingParsed || (status !== "P" && status !== "ADJ-P" && status !== "ADJ-P/A" && status !== "ADJP/A")) {
      return {
        ...day,
        attendance: {
          ...day.attendance,
          // SPECIAL RULE: Force late and OT to 0 for employee 143
          lateMins: isKaplesh ? "0" : day.attendance.lateMins,
          otHrs: isKaplesh ? "0:00" : day.attendance.otHrs,
        },
        hasOTCalculation,
        originalOTValue,
        calculatedOTMinutes,
        originalEarlyDep: hasEarlyDepCalculation ? originalEarlyDep : undefined,
        hasEarlyDepCalculation,
        originalLateMins: originalLateMinsForPA,
        hasLateOverride,
      } as DayAttendance & {
        originalLateMins?: string;
        originalOTHrs?: string;
        hasCustomCalculation?: boolean;
        hasOTCalculation?: boolean;
        originalOTValue?: string;
        calculatedOTMinutes?: number;
        originalEarlyDep?: string;
        hasEarlyDepCalculation?: boolean;
        hasLateOverride?: boolean;
      };
    }

    const originalLateMins = String(day.attendance.lateMins ?? "");
    const originalOTHrs = String(day.attendance.otHrs ?? "");
    const recalculatedLateMins = isKaplesh ? 0 : recalculateLateMinutes(
      day.attendance.inTime,
      customTimingParsed
    );
    const recalculatedOTHrs = isKaplesh ? "0:00" : recalculateOTHours(
      day.attendance.inTime,
      day.attendance.outTime,
      customTimingParsed
    );
    return {
      ...day,
      attendance: {
        ...day.attendance,
        lateMins: recalculatedLateMins.toString(),
        otHrs: recalculatedOTHrs,
      },
      originalLateMins: originalLateMinsForPA || originalLateMins,
      originalOTHrs,
      hasCustomCalculation: true,
      hasOTCalculation,
      originalOTValue,
      calculatedOTMinutes,
      originalEarlyDep: hasEarlyDepCalculation ? originalEarlyDep : undefined,
      hasEarlyDepCalculation,
      hasLateOverride,
    } as DayAttendance & {
      originalLateMins?: string;
      originalOTHrs?: string;
      hasCustomCalculation?: boolean;
      hasOTCalculation?: boolean;
      originalOTValue?: string;
      calculatedOTMinutes?: number;
      originalEarlyDep?: string;
      hasEarlyDepCalculation?: boolean;
      hasLateOverride?: boolean;
    };
  });



  const getStatusColor = (status: string, day?: DayAttendance) => {
    const s = status.toUpperCase();
    if (s === "ADJ-P")
      return "bg-lime-100 text-lime-800 border-lime-300 ring-2 ring-lime-400";
    if (s === "ADJ-P/A" || s === "ADJP/A")
      return "bg-yellow-100 text-yellow-800 border-yellow-300 ring-2 ring-yellow-400";
    if (s === "ADJ-M/WO-I")
      return "bg-orange-200 text-orange-800 border-orange-300 ring-2 ring-orange-400";
    if (s === "P") return "bg-green-100 text-green-800 border-green-300";
    if (s === "A") return "bg-red-100 text-red-800 border-red-300";
    if (s === "WO") return "bg-gray-100 text-gray-800 border-gray-300";
    if (s === "H") return "bg-blue-100 text-blue-800 border-blue-300";
    if (s === "OD") return "bg-purple-100 text-purple-800 border-purple-300";
    if (s === "LEAVE") return "bg-yellow-100 text-yellow-800 border-yellow-300";
    return "bg-yellow-100 text-yellow-800 border-yellow-300";
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {processedDays.map((day, index) => {
        // Retrieve punches for this day
        let punches = dailyPunchesMap.get(String(day.date));

        // Fallback: if day.date is "1", try "01"
        if (!punches && String(day.date).length === 1) {
          punches = dailyPunchesMap.get(String(day.date).padStart(2, "0"));
        }

        // ⭐ Fallback: If no punch data, create from attendance In/Out times
        if ((!punches || punches.length === 0) && day.attendance.inTime && day.attendance.outTime) {
          const inTime = day.attendance.inTime;
          const outTime = day.attendance.outTime;

          if (inTime !== "-" && outTime !== "-") {
            punches = [
              { type: "In", time: inTime, minutes: timeToMinutes(inTime) },
              { type: "Out", time: outTime, minutes: timeToMinutes(outTime) }
            ];
          }
        }

        // Debug log for first few days
        // if (index < 3) {
        //     console.log(`AttendanceGrid: Day ${day.date} punches:`, punches);
        // }

        // Calculate total break excess for the day
        let totalBreakExcess = 0;
        let rawBreakExcess = 0; // ⭐ Track the raw excess BEFORE any cutoff rules
        if (punches && punches.length > 0) {
          // Define dynamic breaks including the evening break
          const breaks = [
            ...BREAKS,
            {
              name: "Evening Break",
              start: 17 * 60 + 30,
              end: isMaintenance ? 18 * 60 + 30 : 18 * 60,
              allowed: 15
            }
          ];

          for (let i = 0; i < punches.length - 1; i++) {
            const current = punches[i];
            const next = punches[i + 1];

            // ⭐ FIX: Only process if current is Out and next is In (break period)
            // AND ensure Out time is before In time
            if (current.type === "Out" && next.type === "In" && current.minutes < next.minutes) {
              const duration = next.minutes - current.minutes;
              if (duration > 0) {
                let allowed = 0;
                const outMin = current.minutes;
                const inMin = next.minutes;

                for (const defBreak of breaks) {
                  const overlapStart = Math.max(outMin, defBreak.start);
                  const overlapEnd = Math.min(inMin, defBreak.end);
                  const overlap = Math.max(0, overlapEnd - overlapStart);
                  if (overlap > 0) allowed += defBreak.allowed;
                }

                const excess = Math.max(0, duration - allowed);

                // ⭐ Always add to raw excess (for display purposes)
                rawBreakExcess += excess;

                // ⭐ REFINED LOGIC (Final v5):
                // 1. Maintenance: ALWAYS calculate excess
                // 2. OT Granted: ALWAYS calculate excess
                // 3. Regular employees: Skip after 5:30 PM

                const EVENING_CUTOFF = 17 * 60 + 30; // 5:30 PM
                const isGrantedOT = !!grant;

                // If NOT (Maintenance OR OT Granted) AND break starts after 5:30 PM -> Skip
                if (!isMaintenance && !isGrantedOT && outMin >= EVENING_CUTOFF) {
                  // Skip evening break excess (but rawBreakExcess still tracks it)
                } else {
                  totalBreakExcess += excess;
                }
              }
            }
          }
        }

        // ⭐ Calculate if any excess was removed
        const hasBreakExcessRemoved = rawBreakExcess > 0 && rawBreakExcess !== totalBreakExcess;

        return (
          <div
            key={index}
            className={`border-2 rounded-lg p-4 cursor-pointer transition-all hover:shadow-lg ${getStatusColor(
              day.attendance.status,
              day
            )} ${day.isAdjustmentOriginal || day.isAdjustmentTarget ? "relative" : ""
              }`}
            onClick={() => onAdjustmentClick?.(day.date)}
          >
            {/* Adjustment Badge */}
            {day.isAdjustmentOriginal && (
              <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                ✓
              </div>
            )}
            {day.isAdjustmentTarget && (
              <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                ✓
              </div>
            )}

            {/* Custom Timing Badge */}
            {customTimingParsed && day.hasCustomCalculation && (
              <div
                className="absolute -top-2 -left-2 bg-purple-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center"
                title="Custom Timing Applied"
              >
                🕐
              </div>
            )}

            {/* OT Calculation Badge */}
            {day.hasOTCalculation && !day.hasCustomCalculation && (
              <div
                className="absolute -top-2 -left-2 bg-blue-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center"
                title="OT Recalculated"
              >
                ⏱️
              </div>
            )}

            {/* Day Header */}
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-current border-opacity-30">
              <span className="text-lg font-bold">{day.date}</span>
              <span className="text-sm font-semibold">{day.day}</span>
            </div>

            {/* Attendance Details */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-semibold">Shift:</span>
                <span>{day.attendance.shift || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">In Time:</span>
                <span>{day.attendance.inTime || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Out Time:</span>
                <span>{day.attendance.outTime || "-"}</span>
              </div>

              {/* Late Mins */}
              <div className="flex justify-between">
                <span className="font-semibold">Late Mins:</span>
                <span className="">
                  {(() => {
                    const status = (day.attendance.status || "").toUpperCase();
                    const isPAStatus = status === "P/A" || status === "PA" ||
                      status === "ADJ-P/A" || status === "ADJP/A" || status === "ADJ-PA";
                    const lateMins = day.attendance.lateMins || "0";
                    const originalLateMins = day.originalLateMins || lateMins;

                    // Check if this is a P/A status with non-zero original late mins
                    if (isPAStatus && originalLateMins !== "0" && lateMins === "0") {
                      return (
                        <>
                          <span className="line-through text-gray-400 mr-2">
                            {originalLateMins}
                          </span>
                          <span className="font-bold text-red-600">0</span>
                        </>
                      );
                    }

                    // Custom calculation styling
                    if (day.hasCustomCalculation) {
                      return (
                        <span className="font-bold text-purple-700">
                          {lateMins}
                          {" *"}
                        </span>
                      );
                    }

                    // Default display
                    return lateMins;
                  })()}
                </span>
              </div>
              {day.hasCustomCalculation &&
                day.originalLateMins !== day.attendance.lateMins &&
                !((day.attendance.status || "").toUpperCase() === "P/A" ||
                  (day.attendance.status || "").toUpperCase() === "PA" ||
                  (day.attendance.status || "").toUpperCase() === "ADJ-P/A" ||
                  (day.attendance.status || "").toUpperCase() === "ADJP/A" ||
                  (day.attendance.status || "").toUpperCase() === "ADJ-PA") && (
                  <div className="flex justify-between text-xs opacity-60 -mt-1 ml-4">
                    <span>Prev Late:</span>
                    <span className="line-through">
                      {day.originalLateMins || "0"}
                    </span>
                  </div>
                )}

              <div className="flex justify-between">
                <span className="font-semibold">Early Dep:</span>
                <span className="">
                  {day.hasEarlyDepCalculation && day.originalEarlyDep && (
                    <span className="line-through text-gray-400 mr-2">
                      {day.originalEarlyDep}
                    </span>
                  )}
                  <span className={day.hasEarlyDepCalculation ? "font-bold text-red-600" : ""}>
                    {day.attendance.earlyDep || "0"}
                  </span>
                </span>
              </div>

              {/* OT Hours */}
              <div className="flex justify-between">
                <span className="font-semibold">OT Hours:</span>
                <span
                  className={
                    day.hasCustomCalculation
                      ? "font-bold text-purple-700"
                      : day.hasOTCalculation
                        ? "font-bold text-blue-700"
                        : ""
                  }
                >
                  {day.attendance.otHrs || "0:00"}
                  {day.hasCustomCalculation && " *"}
                  {day.hasOTCalculation && !day.hasCustomCalculation && " ✓"}
                </span>
              </div>
              {/* Show custom timing OT recalculation */}
              {day.hasCustomCalculation && day.originalOTHrs && (
                <div className="flex justify-between text-xs opacity-60 -mt-1 ml-4">
                  <span>Prev OT:</span>
                  <span className="line-through">
                    {day.originalOTHrs || "0:00"}
                  </span>
                </div>
              )}
              {/* Show normal OT calculation (for staff/worker rules) */}
              {day.hasOTCalculation && !day.hasCustomCalculation && day.originalOTValue && (
                <div className="flex justify-between text-xs opacity-60 -mt-1 ml-4">
                  <span>Raw OT:</span>
                  <span className="line-through">
                    {day.originalOTValue || "0:00"}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="font-semibold">Work Hours:</span>
                <span className="font-bold">
                  {day.attendance.workHrs || "0:00"}
                </span>
              </div>

              {/* Break Excess - Show removal if applicable */}
              {(totalBreakExcess > 0 || hasBreakExcessRemoved) && (
                <div className="flex justify-between">
                  <span className="font-semibold">Break Excess:</span>
                  <span>
                    {hasBreakExcessRemoved && (
                      <span className="line-through text-gray-400 mr-2">
                        +{rawBreakExcess}m
                      </span>
                    )}
                    <span className={hasBreakExcessRemoved ? "font-bold text-green-600" : "font-bold text-red-600"}>
                      {totalBreakExcess > 0 ? `+${totalBreakExcess}m` : "0"}
                    </span>
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-current border-opacity-30">
                <span className="font-semibold">Status:</span>
                <span className="font-bold text-lg">
                  {day.attendance.status || "-"}
                </span>
              </div>

              {/* Show original status if adjusted */}
              {day.originalStatus && (
                <div className="flex justify-between pt-2 border-t border-current border-opacity-30 text-xs opacity-70">
                  <span className="font-semibold">Original:</span>
                  <span>{day.originalStatus}</span>
                </div>
              )}

              {/* Custom timing notice */}
              {day.hasCustomCalculation && (
                <div className="pt-2 border-t border-current border-opacity-30 text-xs text-purple-700">
                  * Recalculated for {customTime}
                </div>
              )}

              {/* OT calculation notice */}
              {day.hasOTCalculation && !day.hasCustomCalculation && (
                <div className="pt-2 border-t border-current border-opacity-30 text-xs text-blue-700">
                  ✓ OT calculated ({isStaff ? "Staff" : "Worker"} rules)
                </div>
              )}

              {/* --- MINI TRAIN VIEW --- */}
              {punches && punches.length > 0 && (
                <div className="mt-3 pt-2 border-t border-current border-opacity-30">
                  <div className="text-[10px] font-bold opacity-70 mb-1">Punch Timeline:</div>
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-300">
                    {punches.map((punch: any, pIdx: number) => {
                      const isIn = punch.type === "In";
                      return (
                        <React.Fragment key={pIdx}>
                          {/* Node */}
                          <div className="flex flex-col items-center flex-shrink-0">
                            <div className={`w-10 h-8 rounded flex flex-col items-center justify-center shadow-sm border ${isIn ? "bg-green-50 border-green-400" : "bg-red-50 border-red-400"
                              }`}>
                              <div className={`text-[8px] font-bold leading-none ${isIn ? "text-green-700" : "text-red-700"}`}>
                                {isIn ? "IN" : "OUT"}
                              </div>
                              <div className="text-[9px] font-bold text-gray-800 leading-none mt-0.5">
                                {formatTime(punch.time)}
                              </div>
                            </div>
                          </div>

                          {/* Arrow + Duration */}
                          {pIdx < punches.length - 1 && (() => {
                            const next = punches[pIdx + 1];
                            const duration = next.minutes - punch.minutes;
                            if (duration < 0) return null;

                            // ⭐ FIX: Only calculate break excess for valid Out-In pairs
                            const isBreak = punch.type === "Out" && next.type === "In" && punch.minutes < next.minutes;

                            // Calculate excess
                            let allowed = 0;
                            let excess = 0;

                            if (isBreak) {
                              const outMin = punch.minutes;
                              let inMin = next.minutes;

                              // ⭐ REFINED LOGIC (Final v5):
                              // 1. Maintenance: ALWAYS calculate excess
                              // 2. OT Granted: ALWAYS calculate excess
                              // 3. Regular employees: Skip after 5:30 PM

                              const EVENING_CUTOFF = 17 * 60 + 30; // 5:30 PM

                              // Calculate potential excess first
                              const calcDuration = inMin - outMin;

                              // Include Evening Break in the calculation
                              const allBreaks = [
                                ...BREAKS,
                                { name: "Evening Break", start: 17 * 60 + 30, end: 18 * 60 + 30, allowed: 15 }
                              ];

                              for (const defBreak of allBreaks) {
                                const overlapStart = Math.max(outMin, defBreak.start);
                                const overlapEnd = Math.min(inMin, defBreak.end);
                                const overlap = Math.max(0, overlapEnd - overlapStart);
                                if (overlap > 0) allowed += defBreak.allowed;
                              }

                              excess = Math.max(0, calcDuration - allowed);

                              // Apply the specific rule for Regular employees (not Maintenance, not OT Granted)
                              const isGrantedOT = !!grant;
                              if (!isMaintenance && !isGrantedOT && outMin >= EVENING_CUTOFF) {
                                excess = 0;
                              }
                            }

                            return (
                              <div className="flex flex-col items-center justify-center mx-0.5 flex-shrink-0">
                                <div className="text-gray-400 text-[10px] -mb-1">→</div>
                                <div className={`text-[8px] px-1 rounded ${isBreak && excess > 0 ? "bg-red-200 text-red-800 font-bold" : "bg-white/50 text-gray-600"
                                  }`}>
                                  {duration}m
                                  {isBreak && excess > 0 && ` +${excess}`}
                                </div>
                              </div>
                            );
                          })()}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Verification Details */}
              {punches && punches.length > 0 && (
                <details className="mt-2 text-xs border-t border-gray-200 pt-1 group">
                  <summary className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium select-none flex items-center gap-1 list-none">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Verify Punch Data
                  </summary>
                  <div className="mt-2 bg-gray-50 p-2 rounded border border-gray-200">
                    <div className="grid grid-cols-1 gap-1 mb-2">
                      <div className="break-words">
                        <span className="font-bold text-green-700">In:</span> {punches.filter((p: any) => p.type === 'In').map((p: any) => p.time).join(', ')}
                      </div>
                      <div className="break-words">
                        <span className="font-bold text-red-700">Out:</span> {punches.filter((p: any) => p.type === 'Out').map((p: any) => p.time).join(', ')}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-[10px] font-bold border border-green-300 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Verified
                      </span>
                    </div>
                  </div>
                </details>
              )}
            </div>
          </div>
        );
      })}
    </div>

  );
};
