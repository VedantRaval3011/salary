import { EmployeeData } from "./types";

// Helper to convert time string to minutes
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + (minutes || 0);
};

// Helper to parse OT/Work minutes from various formats
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

// Helper for custom timing OT
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

// Helper to check if employee is Staff or Worker
const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${
    emp.department ?? ""
  }`.toLowerCase();
  if (inStr.includes("c cash")) return false;
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  // ⭐ Default to WORKER (false)
  return false;
};

/**
 * A shared function to calculate all present day stats for a single employee.
 * This can be used by any component, removing duplicate logic.
 */
export function calculateEmployeeStats(
  employee: EmployeeData,
  baseHolidaysCount: number,
  selectedHolidaysCount: number,
  getPL: (emp: Pick<EmployeeData, "empCode" | "empName">) => number,
  getGrantForEmployee: (
    emp: Pick<EmployeeData, "empCode" | "empName">
  ) => any | undefined,
  getFullNightOTForEmployee: (
    emp: Pick<EmployeeData, "empCode" | "empName">
  ) => number,
  getCustomTimingForEmployee: (
    emp: Pick<EmployeeData, "empCode" | "empName">
  ) => {
    customTime: string;
    expectedEndMinutes: number;
    expectedStartMinutes: number;
  } | null,
  isMaintenanceEmployee: (
    emp: Pick<EmployeeData, "empCode" | "empName">
  ) => boolean,
  finalDifference: number = 0 // 🆕 ADD THIS PARAMETER WITH DEFAULT VALUE
) {
  // --- 1. Calculate PAA (Present After Adjustment) ---
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

      // Updated threshold to 320 minutes (5h 20m)
      if (workMins > 0 && workMins <= 320) {
        isAdjPHalfDay = true;
      }
    }

    if (status === "P") fullPresentDays++;
    else if (status === "P/A" || status === "PA" || status === "ADJ-P/A" || status === "ADJP/A" || isAdjPHalfDay) paCount++;
    else if (status === "ADJ-P") {
      const inTime = day.attendance.inTime;
      const outTime = day.attendance.outTime;
      if (inTime && inTime !== "-" && outTime && outTime !== "-") {
        adjPresentDays++;
      } else {
        console.log(
          `🚫 ${employee.empName} - Skipping ADJ-P on ${day.date} (no In/Out time)`
        );
      }
    }
  });

  const paAdjustment = paCount * 0.5;
  const PAA = fullPresentDays + adjPresentDays + paAdjustment;
  
  // Check for C CASH EMPLOYEE - Force Holidays to 0
  const isCashEmployee = (employee.department || "").toUpperCase().includes("C CASH EMPLOYEE");
  const H_base = isCashEmployee ? 0 : (selectedHolidaysCount || baseHolidaysCount || 0);

  // --- Sandwich Rule: Remove holidays surrounded by absences or NA ---
  let validHolidays = 0;
  const days = employee.days || [];

  const isAbsentOrNA = (status: string): boolean => {
    const normalized = status.toUpperCase().trim();
    return normalized === "A" || normalized === "NA" || normalized === "ABSENT";
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

  // Find continuous blocks of holidays/special days
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
        const pStatus = (days[j].attendance.status || "").toUpperCase().trim();
        if (!isHolidayOrSpecial(pStatus)) {
          prevStatus = pStatus;
          break;
        }
      }

      let nextStatus = null;
      for (let j = blockEnd + 1; j < days.length; j++) {
        const nStatus = (days[j].attendance.status || "").toUpperCase().trim();
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

      if (isSandwiched) {
        let sandwichedHCount = 0;
        const blockDays = [];
        for (let j = blockStart; j <= blockEnd; j++) {
          const blockStatus = (days[j].attendance.status || "")
            .toUpperCase()
            .trim();
          blockDays.push(`${days[j].date}(${blockStatus})`);
          if (blockStatus === "H") {
            sandwichedHCount++;
          }
        }

        console.log(
          `🥪 ${employee.empName} - Block [${blockDays.join(
            ", "
          )}] is sandwiched between ${prevStatus}(Day ${
            days[blockStart - 1]?.date
          }) and ${nextStatus}(Day ${
            days[blockEnd + 1]?.date
          }) - ${sandwichedHCount} holiday(s) NOT counted`
        );
      } else {
        for (let j = blockStart; j <= blockEnd; j++) {
          const blockStatus = (days[j].attendance.status || "")
            .toUpperCase()
            .trim();
          if (blockStatus === "H") {
            validHolidays++;
            console.log(
              `✅ ${employee.empName} - Day ${days[j].date} (H) is valid - counted`
            );
          }
        }
      }

      i = blockEnd + 1;
    } else {
      i++;
    }
  }

  const Total = PAA + (isCashEmployee ? 0 : validHolidays);
  console.log(
    `📊 ${employee.empName} Total calculation: ` +
      `PAA (${PAA}) + ${
        isCashEmployee ? "0 (cash employee, holidays ignored)" : `Valid Holidays (${validHolidays})`
      } = ${Total}`
  );


  // --- 2. Calculate Late Hours ---
  const customTiming = getCustomTimingForEmployee(employee);
  let lateMinsTotal = 0;

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
  
  // Handle M/WO-I or ADJ-M/WO-I (count if employee attended)
  if (status === "M/WO-I" || status === "ADJ-M/WO-I" || status === "WO-I") {
    const inTime = day.attendance.inTime;
    const outTime = day.attendance.outTime;
    
    if (inTime && inTime !== "-" && outTime && outTime !== "-") {
      // Calculate work hours to determine if half day or full day
      const inMinutes = timeToMinutes(inTime);
      const outMinutes = timeToMinutes(outTime);
      const workMinutes = outMinutes > inMinutes ? outMinutes - inMinutes : 0;
      
      if (workMinutes > 0 && workMinutes <= 240) {
        // Half day (up to 4 hours)
        paCount++;
        console.log(
          `✅ ${employee.empName} - Day ${day.date} (${status}) counted as 0.5 day (worked ${(workMinutes / 60).toFixed(2)}h)`
        );
      } else if (workMinutes > 240) {
        // Full day (more than 4 hours)
        fullPresentDays++;
        console.log(
          `✅ ${employee.empName} - Day ${day.date} (${status}) counted as 1.0 day (worked ${(workMinutes / 60).toFixed(2)}h)`
        );
      }
    } else {
      console.log(
        `🚫 ${employee.empName} - Skipping ${status} on ${day.date} (no In/Out time)`
      );
    }
  } else if (status === "P") {
    fullPresentDays++;
  } else if (status === "P/A" || status === "PA") {
    paCount++;
  } else if (status === "ADJ-P") {
    const inTime = day.attendance.inTime;
    const outTime = day.attendance.outTime;
    if (inTime && inTime !== "-" && outTime && outTime !== "-") {
      adjPresentDays++;
    } else {
      console.log(
        `🚫 ${employee.empName} - Skipping ADJ-P on ${day.date} (no In/Out time)`
      );
    }
  }
});

  const Late_hours = Number((lateMinsTotal / 60).toFixed(2));

  // --- 3. Calculate OT Hours ---
  let totalOTMinutes = 0;
  let customTimingOTMinutes = 0;
  const grant = getGrantForEmployee(employee);

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
          if (dayOTMinutes > 0) customTimingOTMinutes += dayOTMinutes;
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
        totalOTMinutes += Math.min(dayOTMinutes, 540);
      }
    });
  } else {
    // Worker NOT granted: All non-ADJ-P days
    if (isWorker) {
      console.log(
        `👷 ${employee.empName} is Worker and Not Granted. Counting all non-ADJ-P days.`
      );

      employee.days?.forEach((day) => {
        const status = (day.attendance.status || "").toUpperCase();

        if (status !== "ADJ-P") {
          let dayOTMinutes = 0;
          if (customTiming) {
            dayOTMinutes = calculateCustomTimingOT(
              day.attendance.outTime,
              customTiming.expectedEndMinutes
            );
            if (dayOTMinutes > 0) customTimingOTMinutes += dayOTMinutes;
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
          totalOTMinutes += Math.min(dayOTMinutes, 540);
        }
      });
    } else {
      // Staff NOT granted: Only Saturdays (excluding ADJ-P)
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
            if (dayOTMinutes > 0) customTimingOTMinutes += dayOTMinutes;
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
          totalOTMinutes += Math.min(dayOTMinutes, 540);
        }
      });
    }
  }

  // Add Full Night Stay OT
  const fullNightOTHours = getFullNightOTForEmployee(employee);
  if (fullNightOTHours > 0) {
    totalOTMinutes += fullNightOTHours * 60;
  }

  // Apply 5% OT Deduction for Maintenance Employees
  let wasOTDeducted = false;
  if (isMaintenanceEmployee(employee)) {
    totalOTMinutes = totalOTMinutes * 0.95;
    wasOTDeducted = true;
  }

  const OT_hours = Number((totalOTMinutes / 60).toFixed(2));
  const customTimingOTHours = Number((customTimingOTMinutes / 60).toFixed(2));

  // --- 4. Calculate Final Totals ---
  // --- 4. Calculate Final Totals ---
  let AdditionalOT = 0;

  if (finalDifference < 0) {
    // finalDifference is negative, meaning deductions exceed OT
    const negativeHours = Math.abs(finalDifference) / 60; // Convert minutes to hours

    // Deduction Rule:
    // 0 to < 4 hours = 0.5 day
    // 4 to < 8 hours = 1.0 day
    // 8 to < 12 hours = 1.5 days
    // 12 to < 16 hours = 2.0 days, etc.

    if (negativeHours < 4) {
      AdditionalOT = 0.5;
      console.log(
        `⚠️ ${employee.empName} - Final Difference: ${(
          finalDifference / 60
        ).toFixed(2)}h (< 4h). Deduction: 0.5 days`
      );
    } else {
      // For 4+ hours: 0.5 day for every 4-hour block
      const blocks = Math.ceil(negativeHours / 4);
      AdditionalOT = blocks * 0.5;

      console.log(
        `⚠️ ${employee.empName} - Final Difference: ${(
          finalDifference / 60
        ).toFixed(2)}h (${negativeHours.toFixed(
          1
        )}h). Blocks: ${blocks}. Deduction: ${AdditionalOT} days`
      );
    }
  } else {
    // finalDifference is positive or zero, no deduction needed
    AdditionalOT = 0;
    console.log(
      `✅ ${employee.empName} - Final Difference: ${(
        finalDifference / 60
      ).toFixed(2)}h (positive/zero). No deduction.`
    );
  }

  const ATotal = Math.max(Total - AdditionalOT, 0);
  const pl = getPL(employee) || 0;
  const GrandTotal = Math.max(ATotal + pl, 0);
  // --- 5. Return all calculated values ---
  return {
    PD_excel: employee.present || 0,
    PAA: Number(PAA.toFixed(1)),
    H_base,
    Total: Number(Total.toFixed(1)),
    Late_hours,
    OT_hours,
    AdditionalOT: Number(AdditionalOT.toFixed(1)),
    ATotal: Number(ATotal.toFixed(1)),
    PL_days: pl,
    GrandTotal: Number(GrandTotal.toFixed(1)),
    paCount,
    adjPresentDays,
    fullNightOTHours,
    customTimingOTHours,
    wasOTDeducted,
  };
}