"use client";

import React, { useMemo, useState, useCallback } from "react";
import { useExcel } from "@/context/ExcelContext";
import { EmployeeData } from "@/lib/types";
import { useFinalDifference } from "@/context/FinalDifferenceContext";
import {
  exportComparisonToExcel,
  ComparisonData,
} from "@/lib/exportComparison";
import { useHRDataLookup } from "@/hooks/useHRDataLookup";
import { calculateEmployeeStats } from "@/lib/statsCalculator"; // <-- IMPORT THE SHARED CALCULATOR
import { ArrowDown, ArrowUp } from "lucide-react";

// Define the type for the sorting state
type SortColumn = keyof ComparisonData | "difference";
type SortDirection = "asc" | "desc";

// Import the same helper functions used in PresentDayStatsGrid
const canon = (s: string) => (s ?? "").toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");
const nameKey = (s: string) => stripNonAlnum(s);

// Helper to get Paid Leave (Keeping all helper functions unchanged)
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

// Helper for Staff OT Granted (Keeping all helper functions unchanged)
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

// Helper for Full Night OT (Keeping all helper functions unchanged)
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

// Helper for Custom Timing (Keeping all helper functions unchanged)
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

// Helper for Maintenance Deduction (Keeping all helper functions unchanged)
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

interface PresentDayComparisonProps {}

export const PresentDayComparison: React.FC<
  PresentDayComparisonProps
> = ({}) => {
  const { excelData } = useExcel();
  const [showTable, setShowTable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    key: SortColumn;
    direction: SortDirection;
  }>({
    key: "empCode", // Default sort column
    direction: "asc", // Default sort direction
  });
  const { employeeFinalDifferences } = useFinalDifference();

  const [finalDifferences, setFinalDifferences] = useState<Map<string, number>>(
    new Map()
  );

  // --- Lookup Hooks ---
  const { getHRPresentDays } = useHRDataLookup();
  const { getPL } = usePaidLeaveLookup();
  const { getGrantForEmployee } = useStaffOTGrantedLookup();
  const { getFullNightOTForEmployee } = useFullNightOTLookup();
  const { getCustomTimingForEmployee } = useCustomTimingLookup();
  const { isMaintenanceEmployee } = useMaintenanceDeductLookup();

  const baseHolidaysCount = (excelData as any)?.baseHolidaysCount ?? 0;

  const getSelectedHolidaysCount = () => {
    if (!excelData?.employees?.[0]?.days) return 0;
    return excelData.employees[0].days.filter(
      (day) => day.attendance.status?.toUpperCase() === "H" && day.isHoliday
    ).length;
  };

  const selectedHolidaysCount = getSelectedHolidaysCount();

  const comparisonData: ComparisonData[] = useMemo(() => {
    if (!excelData || !excelData.employees || !showTable) return [];
    setIsLoading(true);

    const data = excelData.employees.map((employee: EmployeeData) => {
      // 🆕 Get the finalDifference for this employee
      const finalDifference =
        employeeFinalDifferences.get(employee.empCode) || 0;

      const stats = calculateEmployeeStats(
        employee,
        baseHolidaysCount,
        selectedHolidaysCount,
        getPL,
        getGrantForEmployee,
        getFullNightOTForEmployee,
        getCustomTimingForEmployee,
        isMaintenanceEmployee,
        finalDifference // 🆕 Pass it here
      );

      const hrPresentDays = getHRPresentDays(employee);

      let difference: number | string;
      const roundedGrandTotal = Number(stats.GrandTotal.toFixed(1));

      if (hrPresentDays === null) {
        difference = "N/A";
      } else {
        difference = Number((roundedGrandTotal - hrPresentDays).toFixed(2));
      }

      return {
        empCode: employee.empCode,
        empName: employee.empName,
        softwarePresentDays: roundedGrandTotal,
        hrPresentDays,
        difference,
      };
    });

    setIsLoading(false);
    return data;
  }, [
    excelData,
    showTable,
    getHRPresentDays,
    getPL,
    getGrantForEmployee,
    getFullNightOTForEmployee,
    getCustomTimingForEmployee,
    isMaintenanceEmployee,
    baseHolidaysCount,
    selectedHolidaysCount,
    employeeFinalDifferences, // 🆕 Add this dependency
  ]);

  // Add after other handlers
  const handleScrollToEmployee = (empCode: string) => {
    const element = document.getElementById(`employee-${empCode}`);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      // Optional: Add a highlight effect
      element.classList.add("ring-4", "ring-green-400");
      setTimeout(() => {
        element.classList.remove("ring-4", "ring-green-400");
      }, 2000);
    }
  };
  // --- Sorting Logic ---
  const sortedData = useMemo(() => {
    if (comparisonData.length === 0) return [];
    const sortableData = [...comparisonData];

    // Sort logic
    sortableData.sort((a, b) => {
      const { key, direction } = sortConfig;

      let aValue: string | number | null = null;
      let bValue: string | number | null = null;

      // Extract values based on the column key
      if (key === "difference") {
        // Handle 'N/A' (treated as extremes) for numerical difference sort
        aValue =
          a.difference === "N/A"
            ? direction === "asc"
              ? Infinity
              : -Infinity
            : (a.difference as number);
        bValue =
          b.difference === "N/A"
            ? direction === "asc"
              ? Infinity
              : -Infinity
            : (b.difference as number);
      } else if (key === "hrPresentDays") {
        // Handle null (treated as extremes) for hrPresentDays sort
        aValue =
          a.hrPresentDays === null
            ? direction === "asc"
              ? Infinity
              : -Infinity
            : a.hrPresentDays;
        bValue =
          b.hrPresentDays === null
            ? direction === "asc"
              ? Infinity
              : -Infinity
            : b.hrPresentDays;
      } else if (key === "empCode" || key === "empName") {
        aValue = a[key];
        bValue = b[key];
      } else if (key === "softwarePresentDays") {
        aValue = a[key];
        bValue = b[key];
      }

      if (aValue === null || bValue === null) return 0;

      if (typeof aValue === "string" && typeof bValue === "string") {
        const comparison = aValue.localeCompare(bValue);
        return direction === "asc" ? comparison : -comparison;
      } else if (typeof aValue === "number" && typeof bValue === "number") {
        return direction === "asc" ? aValue - bValue : bValue - aValue;
      }
      return 0;
    });

    return sortableData;
  }, [comparisonData, sortConfig]);

  // Handler to change sorting
  const requestSort = useCallback(
    (key: SortColumn) => {
      let direction: SortDirection = "asc";
      // If currently sorting by this key, flip the direction
      if (sortConfig.key === key && sortConfig.direction === "asc") {
        direction = "desc";
      }
      setSortConfig({ key, direction });
    },
    [sortConfig]
  );

  /**
   * Renders both up and down arrows for all columns.
   * The active sorting arrow is highlighted (text-gray-900), the inactive is dimmed (text-gray-300).
   */
  const getSortArrows = (key: SortColumn) => (
    <div className="flex flex-col ml-1">
      <ArrowUp
        size={10}
        className={
          sortConfig.key === key && sortConfig.direction === "asc"
            ? "text-gray-900"
            : "text-gray-300"
        }
      />
      <ArrowDown
        size={10}
        className={
          sortConfig.key === key && sortConfig.direction === "desc"
            ? "text-gray-900"
            : "text-gray-300"
        }
      />
    </div>
  );

  const handleCompareClick = () => {
    setShowTable(true);
  };

  const handleExportClick = () => {
    if (comparisonData.length === 0) {
      console.warn(
        "Please click 'Compare' first to generate the data for export."
      );
      return;
    }
    exportComparisonToExcel(sortedData);
  };

  if (!excelData) return null;

  const tableHeaders: { label: string; key: SortColumn }[] = [
    { label: "Emp Code", key: "empCode" },
    { label: "Emp Name", key: "empName" },
    { label: "Software Grand Total", key: "softwarePresentDays" },
    { label: "HR (Tulsi)", key: "hrPresentDays" },
    { label: "Difference", key: "difference" },
  ];

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
                  {tableHeaders.map((header) => (
                    <th
                      key={header.key}
                      onClick={() => requestSort(header.key)}
                      className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      <div className="flex items-center">
                        {header.label}
                        {/* RENDER BOTH ARROWS FOR ALL HEADERS */}
                        {getSortArrows(header.key)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedData.map((row) => {
                  const diffClass =
                    row.difference === 0
                      ? "text-green-600"
                      : "text-red-600 font-bold";
                  return (
                    <tr key={row.empCode}>
                      {/* 🆕 Clickable Emp Code */}
                      <td
                        className="px-4 py-2 whitespace-nowrap text-sm text-blue-600 font-medium cursor-pointer hover:text-blue-800 hover:underline"
                        onClick={() => handleScrollToEmployee(row.empCode)}
                      >
                        {row.empCode}
                      </td>

                      {/* 🆕 Clickable Emp Name */}
                      <td
                        className="px-4 py-2 whitespace-nowrap text-sm text-blue-600 cursor-pointer hover:text-blue-800 hover:underline"
                        onClick={() => handleScrollToEmployee(row.empCode)}
                      >
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
