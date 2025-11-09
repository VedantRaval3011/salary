"use client";

import React, { useMemo, useState } from "react";
import { useExcel } from "@/context/ExcelContext";
import { EmployeeData } from "@/lib/types";
import {
  exportComparisonToExcel,
  ComparisonData,
} from "@/lib/exportComparison";
import { useHRDataLookup } from "@/hooks/useHRDataLookup";
import { calculateEmployeeStats } from "@/lib/statsCalculator"; // <-- IMPORT THE SHARED CALCULATOR

// Import the same helper functions used in PresentDayStatsGrid
const canon = (s: string) => (s ?? "").toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");
const nameKey = (s: string) => stripNonAlnum(s);

// Helper to get Paid Leave
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

// Helper for Staff OT Granted
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

// Helper for Full Night OT
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

// Helper for Custom Timing
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

// Helper for Maintenance Deduction
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

interface PresentDayComparisonProps {
  // No longer needed from props
  // selectedHolidaysCount?: number;
  // baseHolidaysCount?: number;
}

export const PresentDayComparison: React.FC<PresentDayComparisonProps> = (
  {
    // The props are no longer needed, so we remove them
    // selectedHolidaysCount = 0,
    // baseHolidaysCount = 0,
  }
) => {
  const { excelData } = useExcel(); // We get excelData from context
  const [showTable, setShowTable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // --- REFACTOR: Call all lookup hooks here ---
  const { getHRPresentDays } = useHRDataLookup();
  const { getPL } = usePaidLeaveLookup();
  const { getGrantForEmployee } = useStaffOTGrantedLookup();
  const { getFullNightOTForEmployee } = useFullNightOTLookup();
  const { getCustomTimingForEmployee } = useCustomTimingLookup();
  const { isMaintenanceEmployee } = useMaintenanceDeductLookup();

  // --- THIS IS THE FIX ---
  // We get the holiday counts directly from the excelData in context,
  // NOT from the props (which were incorrect)
  const baseHolidaysCount = (excelData as any)?.baseHolidaysCount ?? 0;

  // Count the actual holidays that have been marked in the employee days
  // This matches what PresentDayStatsGrid does
  const getSelectedHolidaysCount = () => {
    if (!excelData?.employees?.[0]?.days) return 0;

    // Count days marked as 'H' (Holiday) across all days
    // We only need to check one employee since holidays are applied globally
    return excelData.employees[0].days.filter(
      (day) => day.attendance.status?.toUpperCase() === "H" && day.isHoliday
    ).length;
  };

  const selectedHolidaysCount = getSelectedHolidaysCount();

  const comparisonData: ComparisonData[] = useMemo(() => {
    if (!excelData || !excelData.employees || !showTable) return [];
    setIsLoading(true);

    const data = excelData.employees.map((employee: EmployeeData) => {
      // --- REFACTOR: Call the shared stats function ---
      // All the complex logic is now in `calculateEmployeeStats`
      const stats = calculateEmployeeStats(
        employee,
        baseHolidaysCount, // Pass the locally derived baseHolidaysCount
        selectedHolidaysCount, // Pass the locally derived selectedHolidaysCount
        getPL,
        getGrantForEmployee,
        getFullNightOTForEmployee,
        getCustomTimingForEmployee,
        isMaintenanceEmployee
      );

      // --- All calculation logic below is GONE! ---

      // Get HR Present Days
      const hrPresentDays = getHRPresentDays(employee);

      let difference: number | string;
      // Use the GrandTotal from the returned stats object
      const roundedGrandTotal = Number(stats.GrandTotal.toFixed(1));

      if (hrPresentDays === null) {
        difference = "N/A";
      } else {
        difference = Number((roundedGrandTotal - hrPresentDays).toFixed(2));
      }

      return {
        empCode: employee.empCode,
        empName: employee.empName,
        softwarePresentDays: roundedGrandTotal, // Use the value from the calc function
        hrPresentDays,
        difference,
      };
    });

    setIsLoading(false);
    return data;
  }, [
    excelData,
    showTable,
    // selectedHolidaysCount, // No longer a prop dependency
    // baseHolidaysCount,     // No longer a prop dependency
    getHRPresentDays,
    getPL,
    getGrantForEmployee,
    getFullNightOTForEmployee,
    getCustomTimingForEmployee,
    isMaintenanceEmployee,
  ]); // <-- Pass all lookup functions to dependency array

  const handleCompareClick = () => {
    setShowTable(true);
  };

  const handleExportClick = () => {
    if (comparisonData.length === 0) {
      // Use a modal or non-blocking notification instead of alert()
      console.warn(
        "Please click 'Compare' first to generate the data for export."
      );
      return;
    }
    exportComparisonToExcel(comparisonData);
  };

  if (!excelData) return null;

  return (
    <div className="mt-8 pt-6 border-t border-gray-300">
      <h3 className="text-lg font-bold text-gray-800 mb-4">
        Present Day Comparison
      </h3>

      <div className="flex gap-4">
        {!showTable ? (
          <button
            onClick={handleCompareClick}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            disabled={isLoading}
          >
            {isLoading
              ? "Calculating..."
              : "Compare Software vs HR Present Days"}
          </button>
        ) : (
          <>
            <button
              onClick={handleExportClick}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Export Comparison
            </button>
            <button
              onClick={() => setShowTable(false)}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Hide Comparison
            </button>
          </>
        )}
      </div>

      {showTable && (
        <div className="mt-6 max-h-[600px] overflow-y-auto">
          {isLoading ? (
            <p>Loading...</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Emp Code
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Emp Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Software Grand Total
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    HR (Tulsi)
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Difference
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {comparisonData.map((row) => {
                  const diffClass =
                    row.difference === 0
                      ? "text-green-600"
                      : "text-red-600 font-bold";
                  return (
                    <tr key={row.empCode}>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                        {row.empCode}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                        {row.empName}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                        {row.softwarePresentDays}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                        {row.hrPresentDays ?? "N/A"}
                      </td>
                      <td
                        className={`px-4 py-2 whitespace-nowrap text-sm ${diffClass}`}
                      >
                        {row.difference}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
