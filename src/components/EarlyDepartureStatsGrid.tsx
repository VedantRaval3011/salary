"use client";

import React, { useEffect, useMemo, useState } from "react";
import { EmployeeData } from "@/lib/types";
import { useExcel } from "../context/ExcelContext";
import { useFinalDifference } from "@/context/FinalDifferenceContext";
import { EyeIcon } from "lucide-react";

// Utility helpers
const canon = (s: string) => (s ?? "").toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");
const nameKey = (s: string) => stripNonAlnum(s);

interface Props {
  employee: EmployeeData;
  otGrandTotal?: number;
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
      if (found) {
        console.log(`✅ Found lunch data for ${rawCode}:`, {
          empCode: found.empCode,
          empName: found.empName,
          daysWithData: found.dailyPunches?.length || 0,
        });
      } else {
        console.log(`❌ No lunch data found for ${rawCode} (${rawName})`);
      }

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
    updateOriginalFinalDifference,
  } = useFinalDifference();

  const [showBreakModal, setShowBreakModal] = useState(false);
  const { getCustomTimingForEmployee } = useCustomTimingLookup();
  const { getLunchDataForEmployee } = useLunchInOutLookup();

  // Break time definitions in minutes
  const BREAKS = [
    {
      name: "Tea Break 1",
      start: 10 * 60 + 15,
      end: 10 * 60 + 30,
      allowed: 15,
    },
    {
      name: "Lunch Break",
      start: 12 * 60 + 45,
      end: 13 * 60 + 15,
      allowed: 30,
    },
    {
      name: "Tea Break 2",
      start: 15 * 60 + 15,
      end: 15 * 60 + 30,
      allowed: 15,
    },
  ];

  const lunchBreakAnalysis = useMemo(() => {
    const lunchData = getLunchDataForEmployee(employee);

    console.log(`🔍 Break Analysis for ${employee.empCode}:`, lunchData);

    if (!lunchData || !lunchData.dailyPunches) {
      console.log("❌ No lunch data found");
      return null;
    }

    const dailyBreaks: any[] = [];
    let totalExcessMinutes = 0;

    for (const dayData of lunchData.dailyPunches) {
      const punches = dayData.punches || [];

      console.log(
        `📅 Processing ${dayData.date}: ${punches.length} punches`,
        punches
      );

      if (punches.length < 2) continue;

      interface Punch {
        type: "In" | "Out" | string;
        time: string;
      }

      interface PunchTime {
        type: "In" | "Out" | string;
        minutes: number;
        time: string;
      }

      const punchTimes: PunchTime[] = (punches as Punch[])
        .map((p: Punch) => {
          const minutes = timeToMinutes(p.time);
          console.log(`  ${p.type} at ${p.time} = ${minutes} minutes`);
          return {
            type: p.type,
            minutes,
            time: p.time,
          };
        })
        .filter((p: PunchTime) => p.minutes > 0);

      if (punchTimes.length < 2) {
        console.log("⚠️ Not enough valid punch times");
        continue;
      }

      // Find Out-In pairs (break periods)
      const breakPeriods: any[] = [];
      for (let i = 0; i < punchTimes.length - 1; i++) {
        // VALIDATION: A real break must be Out → In within SAME day and within 9am–7pm
        if (
          punchTimes[i].type === "Out" &&
          punchTimes[i + 1].type === "In" &&
          punchTimes[i + 1].minutes > punchTimes[i].minutes &&
          punchTimes[i].minutes >= 9 * 60 &&
          punchTimes[i].minutes <= 19 * 60
        ) {
          const outTime = punchTimes[i].minutes;
          const inTime = punchTimes[i + 1].minutes;
          const duration = inTime - outTime;

          breakPeriods.push({
            outTime: punchTimes[i].time,
            inTime: punchTimes[i + 1].time,
            outMinutes: outTime,
            inMinutes: inTime,
            duration,
          });
        }
      }

      if (breakPeriods.length === 0) {
        console.log("⚠️ No valid break periods found");
        continue;
      }

      // Check if employee came back after 5:30 PM
      const lastInPunch = punchTimes.filter((p: any) => p.type === "In").pop();
      const hasPostEveningReturn =
        lastInPunch && lastInPunch.minutes >= 17 * 60 + 30;

      console.log(
        `  Post-evening return: ${
          hasPostEveningReturn ? "YES" : "NO"
        } (last In: ${lastInPunch?.time})`
      );

      // Match breaks with defined periods
      const matchedBreaks: any[] = [];
      const processedBreaks = new Set<number>();

      for (let bpIdx = 0; bpIdx < breakPeriods.length; bpIdx++) {
        const bp = breakPeriods[bpIdx];
        let bestMatch: any = null;
        let bestOverlap = 0;

        for (const defBreak of BREAKS) {
          const overlapStart = Math.max(bp.outMinutes, defBreak.start);
          const overlapEnd = Math.min(bp.inMinutes, defBreak.end);
          const overlap = Math.max(0, overlapEnd - overlapStart);

          if (overlap > 0 && overlap > bestOverlap) {
            bestOverlap = overlap;
            bestMatch = defBreak;
          }
        }

        if (bestMatch) {
          const excess = Math.max(0, bp.duration - bestMatch.allowed);
          console.log(
            `  ✅ Matched to ${bestMatch.name}: duration=${bp.duration}, allowed=${bestMatch.allowed}, excess=${excess}`
          );

          matchedBreaks.push({
            name: bestMatch.name,
            outTime: bp.outTime,
            inTime: bp.inTime,
            duration: bp.duration,
            allowed: bestMatch.allowed,
            excess,
          });

          totalExcessMinutes += excess;
          processedBreaks.add(bpIdx);
        } else if (hasPostEveningReturn && bp.outMinutes >= 17 * 60 + 30) {
          const postEveningAllowed = 15;
          const excess = Math.max(0, bp.duration - postEveningAllowed);

          console.log(
            `  ✅ Post-evening break: duration=${bp.duration}, allowed=${postEveningAllowed}, excess=${excess}`
          );

          matchedBreaks.push({
            name: "Post-Evening Break",
            outTime: bp.outTime,
            inTime: bp.inTime,
            duration: bp.duration,
            allowed: postEveningAllowed,
            excess,
          });

          totalExcessMinutes += excess;
          processedBreaks.add(bpIdx);
        }
      }

      // Unauthorized breaks
      for (let bpIdx = 0; bpIdx < breakPeriods.length; bpIdx++) {
        if (!processedBreaks.has(bpIdx)) {
          const bp = breakPeriods[bpIdx];

          console.log(
            `  ⚠️ Unauthorized break: ${bp.outTime} to ${bp.inTime} = ${bp.duration} mins`
          );

          matchedBreaks.push({
            name: "Unauthorized Break",
            outTime: bp.outTime,
            inTime: bp.inTime,
            duration: bp.duration,
            allowed: 0,
            excess: bp.duration,
          });

          totalExcessMinutes += bp.duration;
        }
      }

      if (matchedBreaks.length > 0) {
        dailyBreaks.push({
          date: dayData.date,
          breaks: matchedBreaks,
          allPunches: punchTimes, // Store all punches for train view
        });
      }
    }

    console.log(`📊 Total excess minutes: ${totalExcessMinutes}`);

    return {
      dailyBreaks,
      totalExcessMinutes,
    };
  }, [employee, getLunchDataForEmployee]);

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

      // If P/A and less than 4 hours (240 mins)
      if ((status === "P/A" || status === "PA") && workMins < 240) {
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
    const EVENING_SHIFT_START_MINUTES = 12 * 60 + 45;
    const MORNING_EVENING_CUTOFF_MINUTES = 10 * 60;
    const PERMISSIBLE_LATE_MINS = 5;

    const employeeNormalStartMinutes =
      customTiming?.expectedStartMinutes ?? STANDARD_START_MINUTES;

    let earlyDepartureTotalMinutes = 0;

    employee.days?.forEach((day) => {
      const status = (day.attendance.status || "").toUpperCase();
      const inTime = day.attendance.inTime;

      if (inTime && inTime !== "-") {
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
        } else if (status === "P") {
          if (inMinutes > employeeNormalStartMinutes) {
            dailyLateMins = inMinutes - employeeNormalStartMinutes;
          }
        } else if (isStaff && status === "ADJ-P") {
          console.log(
            `  -> Day ${day.date}: Checking ADJ-P for late (is Staff)`
          );
          if (inMinutes > employeeNormalStartMinutes) {
            dailyLateMins = inMinutes - employeeNormalStartMinutes;
          }
        } else if (isWorker && status === "ADJ-P") {
          console.log(
            `  -> Day ${day.date}: Skipping ADJ-P for late (is Worker)`
          );
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

      if (status !== "P/A" && status !== "PA") {
        if (earlyDepMins > 0) {
          earlyDepartureTotalMinutes += earlyDepMins;
        }
      }
    });

    const breakExcessMinutes = lunchBreakAnalysis?.totalExcessMinutes || 0;

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
      otGrandTotal: Math.round(otGrandTotal), // <-- You have this already
      finalDifference: Math.round(otGrandTotal - totalAfterRelaxation),
    };
  }, [employee, getCustomTimingForEmployee, lunchBreakAnalysis, otGrandTotal]);

  // Add these useEffect hooks after the existing stats useMemo:

  useEffect(() => {
    // ⭐ 1) Save ORIGINAL FINAL DIFFERENCE once
    const orig = originalFinalDifference.get(employee.empCode);
    if (orig === undefined) {
      updateOriginalFinalDifference(employee.empCode, stats.finalDifference);
    }

    // ⭐ 2) Continue updating the live finalDifference normally
    const existing = employeeFinalDifferences.get(employee.empCode);
    if (existing !== stats.finalDifference) {
      updateFinalDifference(employee.empCode, stats.finalDifference);
    }
  }, [
    stats.finalDifference,
    employee.empCode,
    employeeFinalDifferences,
    originalFinalDifference,
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

        {hasDetails && value > 0 && (
          <button
            onClick={() => setShowBreakModal(true)}
            className="
      absolute top-1 left-1
      w-5 h-5
      flex items-center justify-center
      bg-blue-600 hover:bg-blue-700
      text-white text-[8px]
      rounded-full
      shadow
    "
          >
            <EyeIcon size={10}></EyeIcon>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
        <span className="text-orange-600">🏃</span>
        Late & Early Departure
      </h4>

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

          {/* Right side: Final Difference - separated with visual divider */}
          <div className="flex items-center gap-4">
            {/* Visual separator */}
            <div className="h-24 w-[2px] bg-gradient-to-b "></div>

            {/* Final Difference Box */}
            <StatBox
              label="Final Difference"
              value={stats.finalDifference}
              bgColor={
                stats.finalDifference >= 0 ? "bg-green-100" : "bg-red-100"
              }
              textColor={
                stats.finalDifference >= 0 ? "text-green-900" : "text-red-900"
              }
              tooltipKey="finalDifference"
              hasDetails={false}
              isDifference={true}
            />
          </div>
        </div>
      </div>

      {/* Break Analysis Modal (Unchanged) */}
      {showBreakModal && lunchBreakAnalysis && (
        <div className="fixed inset-0 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">☕ Break Time Analysis</h3>
                <p className="text-sm text-blue-100 mt-1">
                  {employee.empName} ({employee.empCode})
                </p>
              </div>
              <button
                onClick={() => setShowBreakModal(false)}
                className="text-white hover:bg-blue-700 rounded-full w-8 h-8 flex items-center justify-center text-xl"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1">
              {/* Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-blue-900">
                      Total Break Excess
                    </div>
                    <div className="text-2xl font-bold text-blue-700 mt-1">
                      {minutesToHHMM(lunchBreakAnalysis.totalExcessMinutes)}
                    </div>
                    <div className="text-xs text-blue-600">
                      ({lunchBreakAnalysis.totalExcessMinutes} minutes)
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-blue-700 bg-blue-100 px-3 py-2 rounded">
                      <strong>Break Rules:</strong>
                      <br />
                      Tea: 15 mins (10:15-10:30, 3:15-3:30)
                      <br />
                      Lunch: 30 mins (12:45-1:15)
                      <br />
                      Post-evening: 15 mins (after 5:30pm)
                    </div>
                  </div>
                </div>
              </div>

              {/* Daily Breakdown */}
              <div className="space-y-4">
                {lunchBreakAnalysis.dailyBreaks.map((day: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden"
                  >
                    {/* Date Header */}
                    <div className="bg-gray-100 px-4 py-2 font-semibold text-sm text-gray-800 border-b border-gray-200">
                      📅 {day.date}
                    </div>

                    {/* Punch Train Timeline */}
                    <div className="p-4 bg-gray-50">
                      <div className="text-xs font-semibold text-gray-600 mb-3">
                        All Punches (Train View):
                      </div>

                      <div className="flex items-center gap-2 overflow-x-auto pb-2">
                        {day.allPunches.map((punch: any, pIdx: number) => {
                          if (!punch) return null;

                          const isIn = punch.type === "In";
                          const isOut = punch.type === "Out";

                          return (
                            <React.Fragment key={pIdx}>
                              {/* Punch Node */}
                              <div className="flex flex-col items-center">
                                <div
                                  className={`w-20 h-16 rounded-lg flex flex-col items-center justify-center shadow-md ${
                                    isIn
                                      ? "bg-green-100 border-2 border-green-500"
                                      : "bg-red-100 border-2 border-red-500"
                                  }`}
                                >
                                  <div
                                    className={`text-xs font-bold ${
                                      isIn ? "text-green-700" : "text-red-700"
                                    }`}
                                  >
                                    {isIn ? "IN" : "OUT"}
                                  </div>
                                  <div className="text-sm font-bold text-gray-800 mt-1">
                                    {formatTime(punch.time)}
                                  </div>
                                </div>
                              </div>

                              {/* Arrow + Duration */}
                              {pIdx < day.allPunches.length - 1 &&
                                (() => {
                                  const next = day.allPunches[pIdx + 1];

                                  if (!next) return null;
                                  if (
                                    typeof punch.minutes !== "number" ||
                                    typeof next.minutes !== "number"
                                  )
                                    return null;

                                  const duration = next.minutes - punch.minutes;
                                  if (duration < 0) return null;

                                  const isBreak =
                                    punch.type === "Out" && next.type === "In";

                                  // Allowed break rules
                                  // Allowed break rules — compute overlap with defined BREAKS
                                  let allowed = 0;
                                  if (isBreak) {
                                    const outMin = punch.minutes;
                                    const inMin = next.minutes;

                                    // Sum overlaps with all defined breaks (tea1, lunch, tea2)
                                    // If break intersects a defined break window, grant the full allowed time for that window.
                                    // (This matches the rule used when matching earlier — e.g. lunch gives full 30 mins if it intersects.)
                                    for (const defBreak of BREAKS) {
                                      const overlapStart = Math.max(
                                        outMin,
                                        defBreak.start
                                      );
                                      const overlapEnd = Math.min(
                                        inMin,
                                        defBreak.end
                                      );
                                      const overlap = Math.max(
                                        0,
                                        overlapEnd - overlapStart
                                      );
                                      if (overlap > 0) {
                                        allowed += defBreak.allowed;
                                      }
                                    }

                                    // Post-evening rule: if the break occurs after 17:30, company allows up to 15 min.
                                    // This handles cases where break wholly lies after 17:30.
                                    if (
                                      outMin >= 17 * 60 + 30 ||
                                      inMin >= 17 * 60 + 30
                                    ) {
                                      // ensure at least 15 min allowed for post-evening part
                                      allowed = Math.max(allowed, 15);
                                    }
                                  }

                                  const excess = Math.max(
                                    0,
                                    duration - allowed
                                  );

                                  return (
                                    <div className="flex flex-col items-center justify-center mx-2">
                                      <div className="text-gray-400 text-xl">
                                        →
                                      </div>

                                      <div
                                        className={`text-[10px] font-semibold px-2 py-1 rounded ${
                                          isBreak && excess > 0
                                            ? "bg-red-200 text-red-800"
                                            : "bg-yellow-100 text-gray-700"
                                        }`}
                                      >
                                        {duration} min
                                        {isBreak &&
                                          excess > 0 &&
                                          ` (+${excess})`}
                                      </div>
                                    </div>
                                  );
                                })()}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowBreakModal(false)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
