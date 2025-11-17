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
import { calculateEmployeeStats } from "@/lib/statsCalculator";
import { ArrowDown, ArrowUp } from "lucide-react";

// Define the type for the sorting state
type SortColumn = keyof ComparisonData | "difference" | "category";
type SortDirection = "asc" | "desc";

// Define the Difference Category type
type DifferenceCategory = "N/A" | "Match" | "Minor" | "Medium" | "Major";

// Extend ComparisonData type locally to include category for sorting and coloring
interface SortableComparisonData extends ComparisonData {
  category: DifferenceCategory;
  company: string;
}

// Import the same helper functions used in PresentDayStatsGrid
const canon = (s: string) => (s ?? "").toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");
const nameKey = (s: string) => stripNonAlnum(s);

/**
 * Determines the category of the difference and returns a numeric sort value.
 * Category definition:
 * - Major: |Diff| > 2
 * - Medium: 1 < |Diff| <= 2
 * - Minor: 0 < |Diff| <= 1
 * - Match: Diff = 0
 */
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

const handleScrollToEmployee = (empCode: string) => {
  const element = document.getElementById(`employee-${empCode}`);
  if (element) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    element.classList.add("ring-4", "ring-green-400");
    setTimeout(() => {
      element.classList.remove("ring-4", "ring-green-400");
    }, 2000);
  }
};

interface PresentDayComparisonProps {}

export const PresentDayComparison: React.FC<
  PresentDayComparisonProps
> = ({}) => {
  const { excelData } = useExcel();
  const [showTable, setShowTable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [filterCompany, setFilterCompany] = useState<string>(
    "INDIANA OPHTHALMICS LLP"
  );
  const companies = [
    "INDIANA OPHTHALMICS LLP",
    "NUTRACEUTICO",
    "SCI PREC",
    "SCI PREC LIFESCIENCES",
  ];

  // New state for filtering
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

  // 1. Calculate and annotate data with category
  const categorizedData: SortableComparisonData[] = useMemo(() => {
    if (!excelData || !excelData.employees || !showTable) return [];
    setIsLoading(true);

    const data: SortableComparisonData[] = excelData.employees.map(
      (employee: EmployeeData) => {
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
          finalDifference
        );

        const hrPresentDays = getHRPresentDays(employee);

        let difference: number | string;
        const roundedGrandTotal = Number(stats.GrandTotal.toFixed(1));

        if (hrPresentDays === null) {
          difference = "N/A";
        } else {
          difference = Number((roundedGrandTotal - hrPresentDays).toFixed(2));
        }

        const { category } = getDifferenceCategory(difference);

        return {
          empCode: employee.empCode,
          empName: employee.empName,
          company: employee.companyName,
          softwarePresentDays: roundedGrandTotal,
          hrPresentDays,
          difference,
          category,
        };
      }
    );

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
    employeeFinalDifferences,
  ]);

  // 2. Sorting Logic (Updated to handle category sort)
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
      } else if (key === "hrPresentDays") {
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
      } else if (
        key === "empCode" ||
        key === "empName" ||
        key === "softwarePresentDays"
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

  // 3. Filtering Logic
  const filteredData = useMemo(() => {
    let data = sortedData;

    // Category filter
    if (filterCategory && filterCategory !== "All") {
      data = data.filter((row) => row.category === filterCategory);
    }

    // Company filter
    if (filterCompany !== "All") {
      data = data.filter((row) => row.company === filterCompany);
    }

    return data;
  }, [sortedData, filterCategory, filterCompany]);

  // Handler to change sorting
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

  /**
   * Get CSS class for the Difference cell based on category
   */
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

  const handleCompareClick = () => {
    setShowTable(true);
  };

  const handleExportClick = () => {
    if (categorizedData.length === 0) {
      console.warn(
        "Please click 'Compare' first to generate the data for export."
      );
      return;
    }
    const exportData = categorizedData.map(({ category, ...rest }) => ({
      ...rest,
      DifferenceCategory: category,
    }));
    exportComparisonToExcel(exportData);
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

      <div className="flex gap-4 mb-4 items-center flex-wrap">
        {!showTable ? (
          <button
            onClick={handleCompareClick}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            disabled={isLoading}
          >
            {isLoading
              ? "Calculating..."
              : "Compare Software vs HR Present Days"}
          </button>
        ) : (
          <>
            <div className=" px-4 py-2 flex gap-3 items-center">
              <span className="text-sm font-medium text-gray-700">
                Company:
              </span>

              <select
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
                className="px-3 py-1 text-sm border rounded-md bg-white"
              >
                <option value="All">All</option>
                {companies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleExportClick}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Export Comparison
            </button>
            <button
              onClick={() => setShowTable(false)}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              Hide Comparison
            </button>
            <span className="text-sm font-medium text-gray-700 ml-4">
              Filter by:
            </span>
            <button
              onClick={() => setFilterCategory("All")}
              className={getCategoryButtonClass("All")}
            >
              All ({categorizedData.length})
            </button>
            <button
              onClick={() => setFilterCategory("Major")}
              className={getCategoryButtonClass("Major")}
            >
              Major (
              {categorizedData.filter((row) => row.category === "Major").length}
              )
            </button>
            <button
              onClick={() => setFilterCategory("Medium")}
              className={getCategoryButtonClass("Medium")}
            >
              Medium (
              {
                categorizedData.filter((row) => row.category === "Medium")
                  .length
              }
              )
            </button>
            <button
              onClick={() => setFilterCategory("Minor")}
              className={getCategoryButtonClass("Minor")}
            >
              Minor (
              {categorizedData.filter((row) => row.category === "Minor").length}
              )
            </button>
            <button
              onClick={() => setFilterCategory("Match")}
              className={getCategoryButtonClass("Match")}
            >
              Match (
              {categorizedData.filter((row) => row.category === "Match").length}
              )
            </button>
            <button
              onClick={() => setFilterCategory("N/A")}
              className={getCategoryButtonClass("N/A")}
            >
              N/A (
              {categorizedData.filter((row) => row.category === "N/A").length})
            </button>
            {/* Company Filter */}
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
                <div className="grid grid-cols-5 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Total Employees:</span>{" "}
                    <span className="font-bold">{categorizedData.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Matches:</span>{" "}
                    <span className="font-bold text-green-600">
                      {
                        categorizedData.filter(
                          (row) => row.category === "Match"
                        ).length
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Minor Diff:</span>{" "}
                    <span className="font-bold text-gray-900">
                      {
                        categorizedData.filter(
                          (row) => row.category === "Minor"
                        ).length
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Medium Diff:</span>{" "}
                    <span className="font-bold text-orange-600">
                      {
                        categorizedData.filter(
                          (row) => row.category === "Medium"
                        ).length
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Major Diff:</span>{" "}
                    <span className="font-bold text-red-600">
                      {
                        categorizedData.filter(
                          (row) => row.category === "Major"
                        ).length
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Comparison Table with Sorting and Filtering */}
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
                          className={`${rowBgClass} hover:bg-blue-50 transition-colors`}
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

                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-semibold">
                            {row.softwarePresentDays}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-semibold">
                            {row.hrPresentDays ?? "N/A"}
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
            </>
          )}
        </div>
      )}
    </div>
  );
};
