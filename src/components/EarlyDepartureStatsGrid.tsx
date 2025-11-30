"use client";

import React, { useEffect, useMemo, useState } from "react";
import { EmployeeData } from "@/lib/types";
import { useExcel } from "../context/ExcelContext";
import { useFinalDifference } from "@/context/FinalDifferenceContext";
import { calculateBreakExcessMinutes } from "@/lib/unifiedCalculations";
import { EyeIcon } from "lucide-react";
import { useHRLateLookup } from "@/hooks/useHRLateLookup";

// Utility helpers
const canon = (s: string) => (s ?? "").toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");
const nameKey = (s: string) => stripNonAlnum(s);

interface Props {
  employee: EmployeeData;
  otGrandTotal?: number;
  staticFinalDifference?: number;
  onFinalDifferenceCalculated?: (difference: number) => void; // 🆕 ADD THIS
  onTotalMinus4Calculated?: (empCode: string, totalMinus4: number) => void;
}

// Helper to check if employee is Staff or Worker
const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${
    emp.department ?? ""
  }`.toLowerCase();
  // The original logic: if 'worker' is present, return false (Worker); if 'staff' is present, return true (Staff); otherwise, default to true (Staff).
  // The prompt states: "if the dept has staff in it's string then we consider him as staff employee"
  // Let's stick to the original, more complete logic unless explicitly told otherwise, but the core check is:
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  return true; // Default to staff
};

/**
 * ---- Lunch In/Out Lookup Hook ----
 */
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
      console.log("❌ No lunch file found in uploaded files");
      return { getLunchDataForEmployee: () => null };
    }

    console.log("✅ Lunch In/Out file detected:", lunchFile.fileName);

    let lunchEmployees: any[] = [];

    // Check if file has processedData from the attendance transformer
    if (
      (lunchFile as any).processedData &&
      Array.isArray((lunchFile as any).processedData)
    ) {
      // Transform the attendance data structure to match expected format
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
      console.log(
        "✅ Found processedData:",
        lunchEmployees.length,
        "employees"
      );
    } else if (
      (lunchFile as any).lunchInOutData &&
      Array.isArray((lunchFile as any).lunchInOutData)
    ) {
      lunchEmployees = (lunchFile as any).lunchInOutData;
      console.log(
        "✅ Found lunchInOutData:",
        lunchEmployees.length,
        "employees"
      );
    } else if (
      (lunchFile as any).data?.employees &&
      Array.isArray((lunchFile as any).data.employees)
    ) {
      lunchEmployees = (lunchFile as any).data.employees;
      console.log(
        "✅ Found data.employees:",
        lunchEmployees.length,
        "employees"
      );
    } else {
      console.log(
        "⚠️ Checking alternative data structures...",
        Object.keys(lunchFile)
      );

      if (Array.isArray((lunchFile as any).employees)) {
        lunchEmployees = (lunchFile as any).employees;
        console.log("✅ Found root-level employees:", lunchEmployees.length);
      } else {
        console.warn("⚠️ Lunch file structure:", lunchFile);
      }
    }

    if (lunchEmployees.length > 0) {
      console.log("📊 Sample lunch employee data:", {
        employee: lunchEmployees[0],
        totalEmployees: lunchEmployees.length,
      });
    }

    const normalizeSpaces = (s: string) =>
      (s ?? "").replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ");
    const cleanName = (s: string) =>
      normalizeSpaces(s ?? "")
        .toUpperCase()
        .replace(/\s+/g, " ") // collapse any kind of space into normal space
        .trim()
        .replace(/[^A-Z0-9 ]/g, ""); // keep letters, digits, spaces only

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
          raw.toUpperCase().trim(), // ✅ Add raw uppercase
        ]);

        variants.forEach((k) => employeeByCode.set(k, emp));
      }

      const normalize = (s: string) =>
        (s ?? "")
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "") // remove diacritics
          .replace(/[^A-Z0-9 ]/gi, " ")
          .replace(/\s+/g, " ")
          .trim()
          .toUpperCase();

      if (emp.empName) {
        const base = normalize(emp.empName);
        employeeByName.set(base, emp);
        employeeByName.set(base.replace(/\s+/g, ""), emp); // no-space
        // remove common suffix/prefix tokens like WORKER, GIRL, MISC
        const reduced = base
          .replace(/\b(WORKER|GIRL|MISC|LABOUR|LABOR)\b/g, "")
          .replace(/\s+/g, "");
        if (reduced) employeeByName.set(reduced, emp);
      }
    }

    console.log("📊 Built lookup maps:", {
      byCode: employeeByCode.size,
      byName: employeeByName.size,
    });

    const cleanNoSpace = (s: string) => cleanName(s).replace(/\s+/g, ""); // remove ALL spaces of any kind

    // --- FIXED LOOKUP FUNCTION ---
    const getLunchDataForEmployee = (
      emp: Pick<EmployeeData, "empCode" | "empName">
    ): any => {
      if (!emp) return null;

      const rawCode = (emp.empCode ?? "").toString().trim();
      const rawName = (emp.empName ?? "").toString().trim();

      // Normalized keys
      const empCodeKey = cleanName(rawCode);
      const empCodeNum = numOnly(rawCode);
      const empNameKey = cleanName(rawName);
      const empNameKeyNoSpace = cleanNoSpace(rawName);

      // Debug the keys
      console.log("🔍 LOOKUP KEYS:", {
        rawCode,
        rawName,
        empCodeKey,
        empCodeNum,
        empNameKey,
        empNameKeyNoSpace,
      });

      let found: any = null;

      // --- EMP CODE MATCHING ---
      if (!found && empCodeKey) found = employeeByCode.get(empCodeKey);

      if (!found && empCodeNum) found = employeeByCode.get(empCodeNum);

      if (!found) found = employeeByCode.get(rawCode.toUpperCase().trim()); // raw fallback

      // --- EMP NAME MATCHING ---
      if (!found && empNameKey) found = employeeByName.get(empNameKey);

      if (!found && empNameKeyNoSpace)
        found = employeeByName.get(empNameKeyNoSpace);

      // --- Debug logs ---
      // if (found) {
      //   console.log(`✅ Found lunch data for ${rawCode}:`, {
      //     empCode: found.empCode,
      //     empName: found.empName,
      //     daysWithData: found.dailyPunches?.length || 0,
      //   });
      // } else {
      //   console.log(`❌ No lunch data found for ${rawCode} (${rawName})`);
      // }

      return found || null;
    };

    return { getLunchDataForEmployee };
  }, [getAllUploadedFiles]);
}

/**
 * ---- 09 to 06 Custom Timing Lookup Hook ----
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

    console.log(
      "✅ 09 to 06 Time Granted file detected:",
      customTimingFile.fileName
    );

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

interface Props {
  employee: EmployeeData;
}

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

const formatTime = (timeStr: string): string => {
  if (!timeStr) return "-";
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  }
  return timeStr;
};

// --- Staff Relaxation Constant ---
const STAFF_RELAXATION_MINUTES = 4 * 60; // 4 hours in minutes

export const EarlyDepartureStatsGrid: React.FC<Props> = ({
  employee,
  otGrandTotal = 0,
  staticFinalDifference = 0,
  onFinalDifferenceCalculated,
  onTotalMinus4Calculated,
}) => {
  const {
    updateFinalDifference,
    updateTotalMinus4,
    employeeFinalDifferences,
    totalMinus4,

    // ⭐ NEW: get + set for ORIGINAL FD
    originalFinalDifference,
  } = useFinalDifference();

  const { getCustomTimingForEmployee } = useCustomTimingLookup();
  const { getLunchDataForEmployee } = useLunchInOutLookup();
  const { getHRLateValue } = useHRLateLookup();

  const stats = useMemo(() => {
    const customTiming = getCustomTimingForEmployee(employee);
    let lateMinsTotal = 0;
    let lessThan4HrMins = 0;

    employee.days?.forEach((day) => {
      const status = (day.attendance.status || "").toUpperCase();
      const workHours = day.attendance.workHrs || 0;

      // Convert work hours like "3:50" to total minutes
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

      // If P/A or ADJ-P/A and less than 4 hours (240 mins)
      // ADJ-P/A should be treated the same as P/A
      // Also ADJ-P if < 4 hours
      if ((status === "P/A" || status === "PA" || status === "ADJ-P/A" || status === "ADJP/A" || status === "ADJ-PA") && workMins <= 240) {
        lessThan4HrMins += 240 - workMins; // difference from 4 hours
      }
    });

    const isStaff = getIsStaff(employee);
    const isWorker = !isStaff;
    console.log(
      `👷 ${employee.empName} is ${isWorker ? "Worker" : "Staff"}. Applying ${
        isWorker ? "Worker" : "Staff"
      } late policy.`
    );

    const STANDARD_START_MINUTES = 8 * 60 + 30;
    const EVENING_SHIFT_START_MINUTES = 13 * 60 + 15;
    const MORNING_EVENING_CUTOFF_MINUTES = 10 * 60;
    const PERMISSIBLE_LATE_MINS = 5;

    const employeeNormalStartMinutes =
      customTiming?.expectedStartMinutes ?? STANDARD_START_MINUTES;

    let earlyDepartureTotalMinutes = 0;

    employee.days?.forEach((day) => {
      const status = (day.attendance.status || "").toUpperCase();
      const inTime = day.attendance.inTime;

      // Check for ADJ-P half day
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

        // Fallback: Calculate from In/Out if workMins is 0
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

      if (inTime && inTime !== "-") {
        const inMinutes = timeToMinutes(inTime);
        let dailyLateMins = 0;

        // ADJ-P/A should be treated the same as P/A
        if (status === "P/A" || status === "PA" || status === "ADJ-P/A" || status === "ADJP/A" || status === "ADJ-PA" || isAdjPHalfDay) {
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
      }

      const earlyDepMins = Number(day.attendance.earlyDep) || 0;

      // ❌ Ignore early departure completely if status is "M/WO-I"
      if (status === "M/WO-I") {
        return; // <-- do not count anything from this day
      }

      // Exclude early departure for P/A and ADJ-P/A (treat ADJ-P/A same as P/A)
      if (status !== "P/A" && status !== "PA" && status !== "ADJ-P/A" && status !== "ADJP/A" && status !== "ADJ-PA" && !isAdjPHalfDay) {
        if (earlyDepMins > 0) {
          earlyDepartureTotalMinutes += earlyDepMins;
        }
      }
    });

    const breakExcessMinutes = calculateBreakExcessMinutes(employee, getLunchDataForEmployee(employee));

    // --- New: Calculate Total Combined Minutes BEFORE relaxation ---
    let totalBeforeRelaxation =
      lateMinsTotal +
      earlyDepartureTotalMinutes +
      breakExcessMinutes +
      lessThan4HrMins;

    // --- Apply Staff Relaxation ---
    let totalAfterRelaxation = totalBeforeRelaxation;
    let staffRelaxationApplied = 0;

    if (isStaff) {
      staffRelaxationApplied = STAFF_RELAXATION_MINUTES;
      totalAfterRelaxation = Math.max(
        0,
        totalBeforeRelaxation - STAFF_RELAXATION_MINUTES
      );
    }

    return {
      Late_hours_in_minutes: Math.round(lateMinsTotal),
      earlyDepartureTotalMinutes: Math.round(earlyDepartureTotalMinutes),
      breakExcessMinutes: Math.round(breakExcessMinutes),
      lessThan4HrMins: Math.round(lessThan4HrMins),
      totalBeforeRelaxation: Math.round(totalBeforeRelaxation),
      totalCombinedMinutes: Math.round(totalAfterRelaxation),
      isStaff,
      staffRelaxationApplied: Math.round(staffRelaxationApplied),
      otGrandTotal: Math.round(otGrandTotal),
      // Use staticFinalDifference (Gross OT) for the calculation to avoid circular dependency
      // when deduction is applied to otGrandTotal in the parent/sibling.
      finalDifference: Math.round(staticFinalDifference - totalAfterRelaxation),
    };
  }, [employee, getCustomTimingForEmployee, getLunchDataForEmployee, otGrandTotal, staticFinalDifference]);

  // Add these useEffect hooks after the existing stats useMemo:

  useEffect(() => {
    // Always update the final difference when stats change
    updateFinalDifference(employee.empCode, stats.finalDifference);

    // Notify parent component if callback exists
    if (onFinalDifferenceCalculated) {
      onFinalDifferenceCalculated(stats.finalDifference);
    }
  }, [
    stats.finalDifference,
    employee.empCode,
    updateFinalDifference,
    onFinalDifferenceCalculated,
  ]);

  useEffect(() => {
    // Always update total minus 4 when stats change
    updateTotalMinus4(employee.empCode, stats.totalCombinedMinutes);

    // Notify parent component if callback exists
    if (onTotalMinus4Calculated) {
      onTotalMinus4Calculated(employee.empCode, stats.totalCombinedMinutes);
    }
  }, [
    stats.totalCombinedMinutes,
    employee.empCode,
    updateTotalMinus4,
    onTotalMinus4Calculated,
  ]);

  useEffect(() => {
    const existing = totalMinus4.get(employee.empCode);

    if (existing === stats.totalCombinedMinutes) return;

    updateTotalMinus4(employee.empCode, stats.totalCombinedMinutes);
  }, [stats.totalCombinedMinutes, employee.empCode, totalMinus4]);

  const tooltipTexts: any = {
    Late_hours_in_minutes:
      "Total chargeable late minutes (over 5 min grace) for the month, shown in HH:MM format.",
    earlyDepartureTotalMinutes:
      "Total minutes left early for the month, from the 'Early Dep' column, shown in HH:MM format.",
    breakExcessMinutes:
      "Total extra minutes taken beyond allowed break times (Tea: 15 mins, Lunch: 30 mins, Post-evening: 15 mins). Click 'View Details' to see breakdown.",
    lessThan4HrMins:
      "Total minutes below 4 working hours on P/A days. For example, if worked 3.50 hrs, counted as 10 mins shortfall.",
    staticFinalDifference:
      "The result of (Total OT + Full Night OT) - Total (-4hrs). This represents the Net OT based on static OT values.",
    finalDifference:
      "The difference between OT Grand Total and Late/Early Departure Total. Positive = More OT earned than deductions. Negative = More deductions than OT earned.",
    totalCombinedMinutes:
      "The sum of total chargeable Late Arrival, Early Departure, Break Excess minute and less than 4 hours minutes for the month. For Staff employees, a 4-hour relaxation is deducted from this total. Shown in HH:MM format.", // Tooltip updated
  };

  const StatBox = ({
    label,
    value,
    bgColor,
    textColor,
    tooltipKey,
    hasDetails,
    isTotal,
    isDifference, // Add this prop
  }: any) => {
    const absValue = Math.abs(value);
    const displayHours = minutesToHHMM(absValue);
    const displayMins = `${absValue} mins`;
    const displayDecimalHours = `${(absValue / 60).toFixed(1)} hrs`;
    const sign = isDifference && value !== 0 ? (value > 0 ? "+" : "-") : "";

    return (
      <div
        className={`relative text-center p-2 w-[130px] ${bgColor} rounded-md border ${textColor} transition-all hover:shadow`}
      >
        <div className="text-[10px] text-gray-600">{label}</div>
        <div className="text-xl font-bold mt-1">
          {sign}
          {displayHours}
        </div>

        <div className="text-[10px] text-gray-500">
          {sign}
          {displayDecimalHours}
        </div>
        <div className="text-[10px] text-gray-500">
          {sign}
          {displayMins}
        </div>


      </div>
    );
  };

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <span className="text-orange-600">🏃</span>
          Late & Early Departure
        </h4>
        
        {/* HR Total(-4hrs) - Small Box */}
        <div className="px-4 py-2 bg-orange-100 border-2 border-orange-400 rounded-lg">
          <div className="text-xs text-orange-700 font-semibold">HR Total(-4hrs)</div>
          <div className="text-lg font-bold text-orange-900">
            {getHRLateValue(employee) !== null 
              ? `${getHRLateValue(employee)?.toFixed(2)} hrs` 
              : "N/A"}
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="mb-3 text-xs text-gray-700  rounded">
        {/* Main layout with two sections */}
        <div className="flex items-center justify-between gap-6">
          {/* Left side: All the regular stats */}
          <div className="flex flex-wrap gap-2">
            <StatBox
              label="Late Arrival"
              value={stats.Late_hours_in_minutes}
              bgColor="bg-red-50"
              textColor="text-red-700"
              hasDetails={false}
            />
            <StatBox
              label="Early Departure"
              value={stats.earlyDepartureTotalMinutes}
              bgColor="bg-yellow-50"
              textColor="text-yellow-800"
              hasDetails={false}
            />
            <StatBox
              label="Break Excess"
              value={stats.breakExcessMinutes}
              bgColor="bg-blue-50"
              textColor="text-blue-700"
              hasDetails={true}
            />
            <StatBox
              label="Less Than 4 Hr (P/A)"
              value={stats.lessThan4HrMins}
              bgColor="bg-purple-50"
              textColor="text-purple-800"
              hasDetails={false}
            />
            <StatBox
              label="Total"
              value={stats.totalBeforeRelaxation}
              bgColor="bg-orange-50"
              textColor="text-orange-800"
              hasDetails={false}
            />

            <StatBox
              label="Total (-4hrs)"
              value={stats.totalCombinedMinutes}
              bgColor="bg-orange-100"
              textColor="text-orange-900"
              hasDetails={false}
              isTotal={true}
            />
          </div>

          {/* Right side: Static Final Difference & Final Difference - separated with visual divider */}
          <div className="flex items-center gap-4">
            {/* Visual separator */}
            <div className="h-24 w-[2px] bg-gradient-to-b "></div>

            {/* Static Final Difference Box */}
            <StatBox
              label="Static Final Difference"
              value={staticFinalDifference - stats.totalCombinedMinutes}
              bgColor="bg-blue-100"
              textColor="text-blue-900"
              tooltipKey="staticFinalDifference"
              hasDetails={false}
              isDifference={true}
            />

            {/* Final Difference Box */}
            <StatBox
              label="Final Difference"
              value={otGrandTotal - stats.totalCombinedMinutes}
              bgColor={
                otGrandTotal - stats.totalCombinedMinutes >= 0
                  ? "bg-green-100"
                  : "bg-red-100"
              }
              textColor={
                otGrandTotal - stats.totalCombinedMinutes >= 0
                  ? "text-green-900"
                  : "text-red-900"
              }
              tooltipKey="finalDifference"
              hasDetails={false}
              isDifference={true}
            />
          </div>
        </div>
      </div>

      {/* Break Analysis Modal (Unchanged) */}

    </div>
  );
};
