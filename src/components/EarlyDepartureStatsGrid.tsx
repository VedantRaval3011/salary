"use client";

import React, { useMemo, useState } from "react";
import { EmployeeData } from "@/lib/types";
import { useExcel } from "../context/ExcelContext";

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

    // THIS IS THE KEY FIX - Check the correct property name
    if (
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
      // ADD THIS: Check the root level for employees array
      console.log(
        "⚠️ Checking alternative data structures...",
        Object.keys(lunchFile)
      );

      // The file might store data directly as lunchFile.employees
      if (Array.isArray((lunchFile as any).employees)) {
        lunchEmployees = (lunchFile as any).employees;
        console.log("✅ Found root-level employees:", lunchEmployees.length);
      } else {
        console.warn("⚠️ Lunch file structure:", lunchFile);
      }
    }

    // Log a sample of the lunch data
    if (lunchEmployees.length > 0) {
      console.log("📊 Sample lunch employee data:", {
        employee: lunchEmployees[0],
        totalEmployees: lunchEmployees.length,
      });
    }

    const key = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";

    const employeeByCode = new Map<string, any>();
    const employeeByName = new Map<string, any>();

    for (const emp of lunchEmployees) {
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

    console.log("📊 Built lookup maps:", {
      byCode: employeeByCode.size,
      byName: employeeByName.size,
    });

    const getLunchDataForEmployee = (
      emp: Pick<EmployeeData, "empCode" | "empName">
    ): any => {
      const empCodeK = key(emp.empCode);
      const empNameK = key(emp.empName);
      const numCodeK = numOnly(emp.empCode);

      console.log(
        `🔍 Looking up lunch data for: ${emp.empCode} (${emp.empName})`
      );
      console.log(
        `  Keys: code="${empCodeK}", num="${numCodeK}", name="${empNameK}"`
      );

      let found = employeeByCode.get(empCodeK);
      if (!found && numCodeK) found = employeeByCode.get(numCodeK);
      if (!found) found = employeeByName.get(empNameK);

      if (found) {
        console.log(`✅ Found lunch data:`, {
          empCode: found.empCode,
          empName: found.empName,
          daysWithData: found.dailyPunches?.length || 0,
        });
      } else {
        console.log(`❌ No lunch data found for ${emp.empCode}`);
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

  // v-- THE FIX IS HERE --v
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  // ^-- THE FIX IS HERE --^

  const [hours, minutes] = parts; // This will correctly get hours and minutes
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

export const EarlyDepartureStatsGrid: React.FC<Props> = ({ employee }) => {
  const [tooltips, setTooltips] = useState<{ [k: string]: boolean }>({});
  const [showBreakDetails, setShowBreakDetails] = useState(false);
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

      // Convert punches to minutes with validation
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
        .filter((p: PunchTime) => p.minutes > 0); // Filter out invalid times

      if (punchTimes.length < 2) {
        console.log("⚠️ Not enough valid punch times");
        continue;
      }

      // Find Out-In pairs (break periods)
      const breakPeriods: any[] = [];
      for (let i = 0; i < punchTimes.length - 1; i++) {
        if (punchTimes[i].type === "Out" && punchTimes[i + 1].type === "In") {
          const outTime = punchTimes[i].minutes;
          const inTime = punchTimes[i + 1].minutes;
          const duration = inTime - outTime;

          if (duration > 0 && duration < 240) {
            // Sanity check: breaks should be < 4 hours
            breakPeriods.push({
              outTime: punchTimes[i].time,
              inTime: punchTimes[i + 1].time,
              outMinutes: outTime,
              inMinutes: inTime,
              duration,
            });
            console.log(
              `  ✅ Break found: ${punchTimes[i].time} to ${
                punchTimes[i + 1].time
              } = ${duration} mins`
            );
          }
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

        // Find which defined break period this overlaps with most
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
          // Post-evening break
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

    // [NEW] Determine if employee is staff or worker
    const isStaff = getIsStaff(employee);
    const isWorker = !isStaff;
    console.log(`👷 ${employee.empName} is ${isWorker ? 'Worker' : 'Staff'}. Applying ${isWorker ? 'Worker' : 'Staff'} late policy.`);


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
        } 
        // [MODIFIED] Apply Staff/Worker logic for ADJ-P
        else if (status === "P") {
            // 'P' (Full Day Present) is ALWAYS checked for lates
            if (inMinutes > employeeNormalStartMinutes) {
              dailyLateMins = inMinutes - employeeNormalStartMinutes;
            }
        } 
        else if (isStaff && status === "ADJ-P") {
            // 'ADJ-P' is ONLY checked for lates if employee is STAFF
            console.log(`  -> Day ${day.date}: Checking ADJ-P for late (is Staff)`);
            if (inMinutes > employeeNormalStartMinutes) {
              dailyLateMins = inMinutes - employeeNormalStartMinutes;
            }
        } 
        else if (isWorker && status === "ADJ-P") {
            // 'ADJ-P' is SKIPPED for lates if employee is WORKER
            console.log(`  -> Day ${day.date}: Skipping ADJ-P for late (is Worker)`);
            // dailyLateMins remains 0
        }
        // [END OF MODIFICATION]

        if (dailyLateMins > PERMISSIBLE_LATE_MINS) {
          lateMinsTotal += dailyLateMins;
        }
      }

      const earlyDepMins = Number(day.attendance.earlyDep) || 0;
      if (earlyDepMins > 0) {
        earlyDepartureTotalMinutes += earlyDepMins;
      }
    });

    const breakExcessMinutes = lunchBreakAnalysis?.totalExcessMinutes || 0;
    const totalCombinedMinutes =
      lateMinsTotal + earlyDepartureTotalMinutes + breakExcessMinutes;

    return {
      Late_hours_in_minutes: Math.round(lateMinsTotal),
      earlyDepartureTotalMinutes: Math.round(earlyDepartureTotalMinutes),
      breakExcessMinutes: Math.round(breakExcessMinutes),
      totalCombinedMinutes: Math.round(totalCombinedMinutes),
    };
  }, [employee, getCustomTimingForEmployee, lunchBreakAnalysis]);

  const tooltipTexts: any = {
    Late_hours_in_minutes:
      "Total chargeable late minutes (over 5 min grace) for the month, shown in HH:MM format.",
    earlyDepartureTotalMinutes:
      "Total minutes left early for the month, from the 'Early Dep' column, shown in HH:MM format.",
    breakExcessMinutes:
      "Total extra minutes taken beyond allowed break times (Tea: 15 mins, Lunch: 30 mins, Post-evening: 15 mins).",
    totalCombinedMinutes:
      "The sum of total chargeable Late Arrival, Early Departure, and Break Excess minutes.",
  };

  const StatBox = ({ label, value, bgColor, textColor, tooltipKey }: any) => {
    const displayValue = minutesToHHMM(value);

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
        <div className="text-xl font-bold mt-1">{displayValue}</div>
      </div>
    );
  };

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
        <span className="text-orange-600">🏃</span>
        Late & Early Departure
      </h4>

      {/* Break Analysis Section */}
      {lunchBreakAnalysis && lunchBreakAnalysis.dailyBreaks.length > 0 && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm text-blue-800 flex items-center gap-2">
              ☕ Break Analysis
            </div>
            <button
              onClick={() => setShowBreakDetails(!showBreakDetails)}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            >
              {showBreakDetails ? "Hide Details" : "Show Details"}
            </button>
          </div>

          <div className="text-xs text-blue-900 mb-2">
            <strong>Total Break Excess:</strong>{" "}
            {minutesToHHMM(lunchBreakAnalysis.totalExcessMinutes)}
          </div>

          {showBreakDetails && (
            <div className="mt-3 space-y-3 max-h-96 overflow-y-auto">
              {lunchBreakAnalysis.dailyBreaks.map((day: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-white border border-blue-300 rounded p-2"
                >
                  <div className="font-semibold text-xs text-blue-900 mb-2">
                    📅 {day.date}
                  </div>

                  <div className="space-y-2">
                    {day.breaks.map((brk: any, bIdx: number) => {
                      const excessClass =
                        brk.excess > 0 ? "text-red-600" : "text-green-600";

                      return (
                        <div
                          key={bIdx}
                          className="bg-gray-50 border border-gray-300 rounded p-2 text-[10px]"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-700">
                              {brk.name}
                            </span>
                            <span className={`font-bold ${excessClass}`}>
                              {brk.excess > 0 ? `+${brk.excess} mins` : "✓ OK"}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-gray-600">
                            <div>
                              <span className="text-gray-500">Out:</span>{" "}
                              {formatTime(brk.outTime)}
                            </div>
                            <div>
                              <span className="text-gray-500">In:</span>{" "}
                              {formatTime(brk.inTime)}
                            </div>
                            <div>
                              <span className="text-gray-500">Duration:</span>{" "}
                              {brk.duration} mins
                            </div>
                          </div>

                          <div className="mt-1 text-gray-500">
                            Allowed: {brk.allowed} mins | Took: {brk.duration}{" "}
                            mins
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 text-[10px] text-blue-700 bg-blue-100 p-2 rounded">
            <strong>Break Rules:</strong> Tea breaks: 15 mins (10:15-10:30,
            3:15-3:30) | Lunch: 30 mins (12:45-1:15) | Post-evening (after
            5:30pm return): 15 mins
          </div>
        </div>
      )}

      {/* Stats Section */}
      <div className="mb-3 text-xs text-gray-700 bg-orange-50 p-3 rounded border border-orange-200">
        <div className="font-semibold mb-2 text-orange-800">
          ⏱️ Punctuality Details:
        </div>
        <div className="flex flex-wrap gap-2">
          <StatBox
            label="Late Arrival"
            value={stats.Late_hours_in_minutes}
            bgColor="bg-red-50"
            textColor="text-red-700"
            tooltipKey="Late_hours_in_minutes"
          />
          <StatBox
            label="Early Departure"
            value={stats.earlyDepartureTotalMinutes}
            bgColor="bg-yellow-50"
            textColor="text-yellow-800"
            tooltipKey="earlyDepartureTotalMinutes"
          />
          <StatBox
            label="Break Excess"
            value={stats.breakExcessMinutes}
            bgColor="bg-blue-50"
            textColor="text-blue-700"
            tooltipKey="breakExcessMinutes"
          />
          <StatBox
            label="Total"
            value={stats.totalCombinedMinutes}
            bgColor="bg-orange-100"
            textColor="text-orange-900"
            tooltipKey="totalCombinedMinutes"
          />
        </div>
      </div>
    </div>
  );
};