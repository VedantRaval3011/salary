"use client";

import React, { useMemo, useState } from "react";
import { useExcel } from "@/context/ExcelContext";
import { EmployeeData } from "@/lib/types";
import {
  exportOTComparisonToExcel,
  OTComparisonData,
} from "@/lib/exportComparison";
import { useHROTLookup } from "@/hooks/useHROTLookup";

/**
 * ===========================
 * HELPER FUNCTIONS
 * ===========================
 */

/**
 * Convert "HH:MM" time strings to total minutes.
 */
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return (hours || 0) * 60 + (minutes || 0);
};

/**
 * Convert minutes to HH:MM string
 */
const minutesToHHMM = (totalMinutes: number): string => {
  if (isNaN(totalMinutes) || totalMinutes <= 0) return "0:00";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

/**
 * Check if employee is Staff or Worker
 */
const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${emp.department ?? ""}`.toLowerCase();
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  return true; // default to staff
};

/**
 * ===========================
 * CUSTOM HOOKS
 * ===========================
 */

/**
 * Hook to get Staff OT Granted info
 */
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

    console.log("✅ Staff OT Granted file detected:", staffOTFile.fileName);

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

    for (const emp of otEmployees) {
      if (emp.empCode) {
        const codeKey = key(emp.empCode);
        const numKey = numOnly(emp.empCode);
        byCode.set(codeKey, emp);
        if (numKey) byCode.set(numKey, emp);
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
      if (!found && numCodeK) found = byCode.get(numCodeK);
      if (!found) found = byName.get(empNameK);

      return found;
    };

    return { getGrantForEmployee };
  }, [getAllUploadedFiles]);
}

/**
 * Hook to get Full Night OT
 */
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

    console.log("✅ Full Night Stay OT file detected:", fullNightFile.fileName);

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

/**
 * Hook to get Custom Timing info (09 to 06)
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
      if (!found && numCodeK) found = employeeByCode.get(numCodeK);
      if (!found) found = employeeByName.get(empNameK);

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

/**
 * Hook to check Maintenance OT Deduct
 */
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

    console.log(
      "✅ Maintenance OT Deduct file detected:",
      deductFile.fileName
    );

    let maintenanceEmployees: any[] = [];
    if (deductFile.data?.employees && Array.isArray(deductFile.data.employees)) {
      maintenanceEmployees = deductFile.data.employees;
    } else {
      console.warn(
        "⚠️ Maintenance deduct file found, but no 'data.employees' array inside."
      );
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

/**
 * ===========================
 * FINAL OT CALCULATION
 * ===========================
 * This replicates the exact logic from OvertimeStatsGrid
 */
function calculateFinalOT(
  employee: EmployeeData,
  getGrantForEmployee: any,
  getFullNightOTForEmployee: any,
  getCustomTimingForEmployee: any,
  isMaintenanceEmployee: any
): number {
  const isStaff = getIsStaff(employee);
  const isWorker = !isStaff;

  const grant = getGrantForEmployee(employee);
  const customTiming = getCustomTimingForEmployee(employee);

  // Helper to parse OT field values (can be time string or decimal)
  const parseMinutes = (val?: string | number | null): number => {
    if (!val) return 0;
    const str = String(val).trim();

    // Handle time format "HH:MM"
    if (str.includes(":")) {
      return timeToMinutes(str);
    }

    // Handle decimal hours (e.g., "8.5" = 8h 30m)
    const decimalHours = parseFloat(str);
    if (!isNaN(decimalHours)) {
      return Math.round(decimalHours * 60);
    }

    return 0;
  };

  // Helper to calculate custom timing OT for a day
  const calculateCustomTimingOT = (
    outTime: string,
    expectedEndMinutes: number
  ): number => {
    if (!outTime || outTime === "-") return 0;
    const outMinutes = timeToMinutes(outTime);
    const otMinutes =
      outMinutes > expectedEndMinutes ? outMinutes - expectedEndMinutes : 0;
    // Ignore minor deviations (less than 5 minutes)
    return otMinutes < 5 ? 0 : otMinutes;
  };

  let otWithoutGrantInMinutes = 0;
  let customTimingOTMinutes = 0;

  // --- CASE 1: NO OT GRANT ---
  if (!grant) {
    if (isStaff) {
      // STAFF (Not Granted): Saturday only, not ADJ-P
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
          // Cap at 9 hours (540 minutes)
          const cappedOT = Math.min(dayOTMinutes, 540);
          otWithoutGrantInMinutes += cappedOT;
        }
      });
    } else {
      // WORKER (Not Granted): All days except ADJ-P
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
          // Cap at 9 hours (540 minutes)
          const cappedOT = Math.min(dayOTMinutes, 540);
          otWithoutGrantInMinutes += cappedOT;
        }
      });
    }
  }

  // --- CASE 2: WITH OT GRANT ---
  let otWithGrantInMinutes = 0;
  if (grant) {
    customTimingOTMinutes = 0; // Reset for grant case

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
        // Cap at 9 hours (540 minutes)
        const cappedOT = Math.min(dayOTMinutes, 540);
        otWithGrantInMinutes += cappedOT;
      }
    });
  }

  // Determine base OT (grant vs no grant)
  const staffOTInMinutes = grant
    ? otWithGrantInMinutes
    : otWithoutGrantInMinutes;

  let totalOTMinutes = staffOTInMinutes;

  // --- ADD FULL NIGHT STAY OT ---
  const fullNightOTDecimalHours = getFullNightOTForEmployee(employee);
  const fullNightOTInMinutes = Math.round(fullNightOTDecimalHours * 60);

  if (fullNightOTInMinutes > 0) {
    totalOTMinutes += fullNightOTInMinutes;
  }

  // --- APPLY 5% MAINTENANCE DEDUCTION ---
  if (isMaintenanceEmployee(employee)) {
    totalOTMinutes = totalOTMinutes * 0.95; // 5% deduction
  }

  return Math.round(totalOTMinutes);
}

/**
 * ===========================
 * MAIN COMPONENT
 * ===========================
 */
export const OTComparison: React.FC = () => {
  const { excelData } = useExcel();
  const [showTable, setShowTable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Get all lookup hooks
  const { getHROTValue } = useHROTLookup();
  const { getGrantForEmployee } = useStaffOTGrantedLookup();
  const { getFullNightOTForEmployee } = useFullNightOTLookup();
  const { getCustomTimingForEmployee } = useCustomTimingLookup();
  const { isMaintenanceEmployee } = useMaintenanceDeductLookup();

  const comparisonData: OTComparisonData[] = useMemo(() => {
    if (!excelData || !excelData.employees || !showTable) return [];
    setIsLoading(true);

    const data: OTComparisonData[] = excelData.employees.map(
      (employee: EmployeeData) => {
        // Calculate FINAL OT using the same logic as OvertimeStatsGrid
        const finalOTMinutes = calculateFinalOT(
          employee,
          getGrantForEmployee,
          getFullNightOTForEmployee,
          getCustomTimingForEmployee,
          isMaintenanceEmployee
        );

        // Convert to decimal hours for display (e.g., 90 minutes = 1.5 hours)
        const softwareOTHours: number = Number((finalOTMinutes / 60).toFixed(2));

        // Get HR OT value from uploaded Tulsi files
        const hrOTHours: number | null = getHROTValue(employee);

        // Calculate difference
        const difference: number | string =
          hrOTHours === null
            ? "N/A"
            : Number((softwareOTHours - hrOTHours).toFixed(2));

        return {
          empCode: employee.empCode,
          empName: employee.empName,
          softwareOTHours,
          hrOTHours,
          difference,
        };
      }
    );

    setIsLoading(false);
    return data;
  }, [
    excelData,
    showTable,
    getHROTValue,
    getGrantForEmployee,
    getFullNightOTForEmployee,
    getCustomTimingForEmployee,
    isMaintenanceEmployee,
  ]);

  const handleCompareClick = () => setShowTable(true);

  const handleExportClick = () => {
    if (comparisonData.length === 0) {
      console.warn("Please click 'Compare' first to generate data.");
      return;
    }
    exportOTComparisonToExcel(comparisonData, "OT_Comparison.xlsx");
  };

  if (!excelData) return null;

  return (
    <div className="mt-8 pt-6 border-t border-gray-300">
      <h3 className="text-lg font-bold text-gray-800 mb-4">
        Overtime (OT) Comparison
      </h3>

      <div className="flex gap-4 mb-4">
        {!showTable ? (
          <button
            onClick={handleCompareClick}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            disabled={isLoading}
          >
            {isLoading ? "Calculating..." : "Compare Software vs HR OT (Hours)"}
          </button>
        ) : (
          <>
            <button
              onClick={handleExportClick}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Export OT Comparison
            </button>
            <button
              onClick={() => setShowTable(false)}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              Hide Comparison
            </button>
          </>
        )}
      </div>

      {showTable && (
        <div className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-600">Loading comparison data...</div>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="mb-4 p-4 bg-blue-50 rounded-md border border-blue-200">
                <div className="text-sm font-semibold text-blue-800 mb-2">
                  📊 Comparison Summary
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Total Employees:</span>{" "}
                    <span className="font-bold">{comparisonData.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Matches:</span>{" "}
                    <span className="font-bold text-green-600">
                      {
                        comparisonData.filter((row) => row.difference === 0)
                          .length
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Mismatches:</span>{" "}
                    <span className="font-bold text-red-600">
                      {
                        comparisonData.filter(
                          (row) => row.difference !== 0 && row.difference !== "N/A"
                        ).length
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Comparison Table */}
              <div className="max-h-[600px] overflow-y-auto border border-gray-300 rounded-md">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b-2 border-gray-300">
                        Emp Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b-2 border-gray-300">
                        Emp Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b-2 border-gray-300">
                        Software Final OT (Hours)
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b-2 border-gray-300">
                        HR (Tulsi) OT (Hours)
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b-2 border-gray-300">
                        Difference
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {comparisonData.map((row, index) => {
                      const diffClass =
                        row.difference === 0
                          ? "text-green-600 font-semibold"
                          : row.difference === "N/A"
                          ? "text-gray-400"
                          : "text-red-600 font-bold";
                      
                      const rowBgClass = index % 2 === 0 ? "bg-white" : "bg-gray-50";
                      
                      return (
                        <tr key={`${row.empCode}-${index}`} className={`${rowBgClass} hover:bg-blue-50 transition-colors`}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 font-medium">
                            {row.empCode}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                            {row.empName}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-semibold">
                            {row.softwareOTHours}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-semibold">
                            {row.hrOTHours ?? "N/A"}
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap text-sm ${diffClass}`}>
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

              {/* Legend */}
              <div className="mt-4 p-3 bg-gray-50 rounded-md border border-gray-200">
                <div className="text-xs text-gray-600">
                  <div className="font-semibold mb-2">Legend:</div>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 font-bold">✓ 0.00</span>
                      <span>= Perfect Match (No difference)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-red-600 font-bold">±X.XX</span>
                      <span>= Difference detected (+ = Software higher, - = HR higher)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">N/A</span>
                      <span>= No HR data available for comparison</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Info Box */}
              <div className="mt-4 p-3 bg-yellow-50 rounded-md border border-yellow-200">
                <div className="text-xs text-yellow-800">
                  <div className="font-semibold mb-1">ℹ️ About this comparison:</div>
                  <ul className="list-disc list-inside space-y-1">
                    <li>
                      <strong>Software Final OT</strong> includes: Base OT + Full Night Stay OT + Custom Timing adjustments - Maintenance deduction (if applicable)
                    </li>
                    <li>
                      <strong>HR (Tulsi) OT</strong> is read from Column I (Staff) or Column F (Worker) in the uploaded HR files
                    </li>
                    <li>
                      <strong>Difference</strong> = Software Final OT - HR OT (positive means software calculated more, negative means HR has more)
                    </li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};