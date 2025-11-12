"use client";

import React, { useMemo, useState, useCallback } from "react";
import { useExcel } from "@/context/ExcelContext";
import { EmployeeData } from "@/lib/types";
import { ArrowDown, ArrowUp } from "lucide-react";

// --- Import fixed export utility and interface ---
import {
  exportLateComparisonToExcel,
  LateComparisonExportData,
} from "@/lib/exportComparisonUtils";

// --- Import new hook ---
import { useHRLateLookup } from "@/hooks/useHRLateLookup";

// ------------------------------------------------
// UTILITY FUNCTIONS
// ------------------------------------------------

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

const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${
    emp.department ?? ""
  }`.toLowerCase();
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  return true;
};

// ------------------------------------------------
// INTERFACES & TYPES
// ------------------------------------------------

interface LateComparisonData {
  empCode: string;
  empName: string;
  softwareTotalHours: number;
  hrLateHours: number | null;
  difference: number | string;
}

type SortColumn = keyof LateComparisonData | "difference" | "category";
type SortDirection = "asc" | "desc";
type DifferenceCategory = "N/A" | "Match" | "Minor" | "Medium" | "Major";

interface SortableLateComparisonData extends LateComparisonData {
  category: DifferenceCategory;
}

// ------------------------------------------------
// CORE COMPARISON LOGIC & HELPERS
// ------------------------------------------------

const calculateSoftwareLateMinutes = (employee: EmployeeData): number => {
  const STANDARD_START_MINUTES = 8 * 60 + 30;
  const EVENING_SHIFT_START_MINUTES = 12 * 60 + 45;
  const MORNING_EVENING_CUTOFF_MINUTES = 10 * 60;
  const PERMISSIBLE_LATE_MINS = 5;

  const employeeNormalStartMinutes = STANDARD_START_MINUTES;
  let lateMinsTotal = 0;
  const isStaff = getIsStaff(employee);

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
        if (inMinutes > employeeNormalStartMinutes) {
          dailyLateMins = inMinutes - employeeNormalStartMinutes;
        }
      }

      if (dailyLateMins > PERMISSIBLE_LATE_MINS) {
        lateMinsTotal += dailyLateMins;
      }
    }
  });

  return Math.round(lateMinsTotal);
};

// Calculate total combined minutes (same logic as EarlyDepartureStatsGrid)
const calculateSoftwareTotalMinutes = (employee: EmployeeData): number => {
  const STAFF_RELAXATION_MINUTES = 4 * 60;

  // Calculate late minutes
  const lateMinsTotal = calculateSoftwareLateMinutes(employee);

  // Calculate early departure
  let earlyDepartureTotalMinutes = 0;
  employee.days?.forEach((day) => {
    const earlyDepMins = Number(day.attendance.earlyDep) || 0;
    if (earlyDepMins > 0) {
      earlyDepartureTotalMinutes += earlyDepMins;
    }
  });

  // Calculate less than 4 hours
  let lessThan4HrMins = 0;
  employee.days?.forEach((day) => {
    const status = (day.attendance.status || "").toUpperCase();
    const workHours = day.attendance.workHrs || 0;

    let workMins = 0;
    if (typeof workHours === "string" && workHours.includes(":")) {
      const [h, m] = workHours.split(":").map(Number);
      workMins = h * 60 + (m || 0);
    } else if (!isNaN(Number(workHours))) {
      workMins = Number(workHours) * 60;
    }

    if ((status === "P/A" || status === "PA") && workMins < 240) {
      lessThan4HrMins += 240 - workMins;
    }
  });

  // Note: Break excess would require lunch data lookup, skipping for now
  // You can add this if needed by importing the lunch lookup hook

  let totalCombinedMinutes =
    lateMinsTotal + earlyDepartureTotalMinutes + lessThan4HrMins;

  // Apply staff relaxation
  const isStaff = getIsStaff(employee);
  if (isStaff) {
    totalCombinedMinutes = Math.max(
      0,
      totalCombinedMinutes - STAFF_RELAXATION_MINUTES
    );
  }

  return Math.round(totalCombinedMinutes);
};

const getDifferenceCategory = (
  diff: number | string
): { category: DifferenceCategory; sortValue: number } => {
  if (diff === "N/A") {
    return { category: "N/A", sortValue: 0 };
  }
  const absDiff = Math.abs(diff as number);

  if (absDiff === 0) {
    return { category: "Match", sortValue: 5 };
  } else if (absDiff > 2) {
    return { category: "Major", sortValue: 4 };
  } else if (absDiff > 1) {
    return { category: "Medium", sortValue: 3 };
  } else {
    return { category: "Minor", sortValue: 2 };
  }
};

const handleScrollToEmployee = (empCode: string) => {
  const element = document.getElementById(`employee-${empCode}`);
  if (element) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    element.classList.add("ring-4", "ring-blue-400");
    setTimeout(() => {
      element.classList.remove("ring-4", "ring-blue-400");
    }, 2000);
  }
};

// ------------------------------------------------
// COMPONENT
// ------------------------------------------------

export const LateComparison: React.FC = () => {
  const { excelData } = useExcel();
  const [showTable, setShowTable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { getHRLateValue } = useHRLateLookup();

  const [filterCategory, setFilterCategory] = useState<
    DifferenceCategory | "All" | null
  >(null);

  const [sortConfig, setSortConfig] = useState<{
    key: SortColumn;
    direction: SortDirection;
  }>({
    key: "empCode",
    direction: "asc",
  });

  // Calculate and annotate data with category
  const categorizedData: SortableLateComparisonData[] = useMemo(() => {
    if (!excelData || !excelData.employees || !showTable) return [];
    setIsLoading(true);

    const data: SortableLateComparisonData[] = excelData.employees.map(
      (employee: EmployeeData) => {
        // Calculate total combined hours
        const softwareTotalMinutes = calculateSoftwareTotalMinutes(employee);
        const softwareTotalHours: number = Number(
          (softwareTotalMinutes / 60).toFixed(2)
        );

        const hrLateHours: number | null = getHRLateValue(employee);

        // Difference is now: Software Total - HR Late
        const difference: number | string =
          hrLateHours === null
            ? "N/A"
            : Number((softwareTotalHours - hrLateHours).toFixed(2));

        const { category } = getDifferenceCategory(difference);

        return {
          empCode: employee.empCode,
          empName: employee.empName,
          softwareTotalHours,
          hrLateHours,
          difference,
          category,
        };
      }
    );

    setIsLoading(false);
    return data;
  }, [excelData, showTable, getHRLateValue]);

  // Sorting Logic
  const sortedData = useMemo(() => {
    if (categorizedData.length === 0) return [];
    const sortableData = [...categorizedData];

    sortableData.sort((a, b) => {
      const { key, direction } = sortConfig;

      let aValue: string | number | null = null;
      let bValue: string | number | null = null;

      if (key === "category") {
        const { sortValue: aSortValue } = getDifferenceCategory(a.difference);
        const { sortValue: bSortValue } = getDifferenceCategory(b.difference);

        return direction === "asc"
          ? aSortValue - bSortValue
          : bSortValue - aSortValue;
      } else if (key === "difference") {
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
      } else if (key === "hrLateHours") {
        aValue =
          a.hrLateHours === null
            ? direction === "asc"
              ? Infinity
              : -Infinity
            : a.hrLateHours;
        bValue =
          b.hrLateHours === null
            ? direction === "asc"
              ? Infinity
              : -Infinity
            : b.hrLateHours;
      } else if (
        key === "empCode" ||
        key === "empName" ||
        key === "softwareTotalHours"
      ) {
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
  }, [categorizedData, sortConfig]);

  // Filtering Logic
  const filteredData = useMemo(() => {
    if (!filterCategory || filterCategory === "All") {
      return sortedData;
    }
    return sortedData.filter((row) => row.category === filterCategory);
  }, [sortedData, filterCategory]);

  const requestSort = useCallback(
    (key: SortColumn) => {
      let direction: SortDirection = "asc";
      if (sortConfig.key === key && sortConfig.direction === "asc") {
        direction = "desc";
      }
      setSortConfig({ key, direction });
    },
    [sortConfig]
  );

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

  const getDiffClass = (category: DifferenceCategory): string => {
    switch (category) {
      case "Major":
        return "text-red-600 font-extrabold";
      case "Medium":
        return "text-orange-600 font-bold";
      case "Minor":
        return "text-gray-900 font-medium";
      case "Match":
        return "text-green-600 font-semibold";
      case "N/A":
        return "text-gray-400";
      default:
        return "text-gray-700";
    }
  };

  const getCategoryButtonClass = (
    buttonCategory: DifferenceCategory | "All" | null
  ) => {
    const baseClass =
      "px-3 py-1 text-xs font-semibold rounded-full transition-colors";
    if (filterCategory === buttonCategory) {
      switch (buttonCategory) {
        case "Major":
          return `${baseClass} bg-red-600 text-white`;
        case "Medium":
          return `${baseClass} bg-orange-600 text-white`;
        case "Minor":
          return `${baseClass} bg-gray-600 text-white`;
        case "Match":
          return `${baseClass} bg-green-600 text-white`;
        case "N/A":
          return `${baseClass} bg-gray-400 text-white`;
        case "All":
        default:
          return `${baseClass} bg-blue-600 text-white`;
      }
    }
    return `${baseClass} bg-gray-200 text-gray-700 hover:bg-gray-300`;
  };

  const handleCompareClick = () => setShowTable(true);

  const handleExportClick = () => {
    if (categorizedData.length === 0) {
      console.warn("Please click 'Compare' first to generate data.");
      return;
    }

    const exportData: LateComparisonExportData[] = categorizedData.map(
      ({ category, ...rest }) => ({
        ...rest,
        DifferenceCategory: category,
      })
    );

    exportLateComparisonToExcel(exportData, "Late_Comparison.xlsx");
  };

  if (!excelData) return null;

  const tableHeaders: { label: string; key: SortColumn }[] = [
    { label: "Emp Code", key: "empCode" },
    { label: "Emp Name", key: "empName" },
    { label: "Software Total (Hours)", key: "softwareTotalHours" },
    { label: "HR (Tulsi) Late (Hours)", key: "hrLateHours" },
    { label: "Difference", key: "difference" },
  ];

  return (
    <div className="mt-8 pt-6 border-t border-gray-300">
      <h3 className="text-lg font-bold text-gray-800 mb-4">
        Late Arrival Comparison
      </h3>

      <div className="flex gap-4 mb-4 items-center flex-wrap">
        {!showTable ? (
          <button
            onClick={handleCompareClick}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
            disabled={isLoading}
          >
            {isLoading
              ? "Calculating..."
              : "Compare Software vs HR Late (Hours)"}
          </button>
        ) : (
          <>
            <button
              onClick={handleExportClick}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Export Late Comparison
            </button>
            <button
              onClick={() => setShowTable(false)}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              Hide Comparison
            </button>

            {/* Filter Buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilterCategory("All")}
                className={getCategoryButtonClass("All")}
              >
                All ({sortedData.length})
              </button>
              <button
                onClick={() => setFilterCategory("Match")}
                className={getCategoryButtonClass("Match")}
              >
                ✓ Match
              </button>
              <button
                onClick={() => setFilterCategory("Minor")}
                className={getCategoryButtonClass("Minor")}
              >
                Minor Diff
              </button>
              <button
                onClick={() => setFilterCategory("Medium")}
                className={getCategoryButtonClass("Medium")}
              >
                Medium Diff
              </button>
              <button
                onClick={() => setFilterCategory("Major")}
                className={getCategoryButtonClass("Major")}
              >
                Major Diff
              </button>
              <button
                onClick={() => setFilterCategory("N/A")}
                className={getCategoryButtonClass("N/A")}
              >
                N/A
              </button>
            </div>
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
            <div className="max-h-[600px] overflow-y-auto border border-gray-300 rounded-md">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    {tableHeaders.map((header) => (
                      <th
                        key={header.key}
                        onClick={() => requestSort(header.key)}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b-2 border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center">
                          {header.label}
                          {getSortArrows(header.key)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredData.map((row, index) => {
                    const diffClass = getDiffClass(row.category);
                    const rowBgClass =
                      index % 2 === 0 ? "bg-white" : "bg-gray-50";

                    return (
                      <tr
                        key={`${row.empCode}-${index}`}
                        className={`${rowBgClass} hover:bg-indigo-50 transition-colors`}
                      >
                        <td
                          className="px-4 py-3 whitespace-nowrap text-sm text-blue-600 font-medium cursor-pointer hover:text-blue-800 hover:underline"
                          onClick={() => handleScrollToEmployee(row.empCode)}
                        >
                          {row.empCode}
                        </td>
                        <td
                          className="px-4 py-3 whitespace-nowrap text-sm text-blue-600 cursor-pointer hover:text-blue-800 hover:underline"
                          onClick={() => handleScrollToEmployee(row.empCode)}
                        >
                          {row.empName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-blue-900 font-bold bg-blue-50">
                          {row.softwareTotalHours}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-semibold">
                          {row.hrLateHours ?? "N/A"}
                        </td>
                        <td
                          className={`px-4 py-3 whitespace-nowrap text-sm ${diffClass}`}
                        >
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
          )}
        </div>
      )}
    </div>
  );
};