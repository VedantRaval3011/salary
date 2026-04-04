"use client";

import React, { useMemo, useState, useCallback } from "react";
import { useExcel } from "@/context/ExcelContext";
import { EmployeeData } from "@/lib/types";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp } from "lucide-react";

import {
  exportLateComparisonToExcel,
  LateComparisonExportData,
} from "@/lib/exportComparisonUtils";

import { getPermissibleLateMinutes } from "@/lib/unifiedCalculations";

import { useHRLateLookup } from "@/hooks/useHRLateLookup";
import { useMaintenanceDeductLookup } from "@/hooks/useMaintenanceDeductLookup";

/* ============================================================
   Utility helpers
   ============================================================ */

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
  const inStr = `${emp.companyName ?? ""} ${emp.department ?? ""}`.toLowerCase();
  if (inStr.includes("c cash")) return false;
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  return true;
};

/* ============================================================
   Break Definitions
   ============================================================ */

const STAFF_RELAXATION_MINUTES = 4 * 60;

const BREAK_DEFINITIONS = [
  { start: 10 * 60 + 15, end: 10 * 60 + 30, allowed: 15 },
  { start: 12 * 60 + 30, end: 14 * 60, allowed: 30 },
  { start: 15 * 60 + 15, end: 15 * 60 + 30, allowed: 15 },
  { start: 19 * 60 + 30, end: 21 * 60, allowed: 30 },
];

/* ============================================================
   FINAL SOFTWARE CALCULATION
   ============================================================ */

const calculateFinalSoftwareMinutes = (
  employee: EmployeeData,
  isMaintenance: boolean
) => {
  const STANDARD_START_MINUTES = 8 * 60 + 30;
  const permissibleLateMins = getPermissibleLateMinutes(employee.companyName);

  let lateMinsTotal = 0;
  let earlyDepartureTotalMinutes = 0;

  employee.days?.forEach((day) => {
    const status = (day.attendance.status || "").toUpperCase();
    const inTime = day.attendance.inTime;

    if (inTime && inTime !== "-") {
      const inMinutes = timeToMinutes(inTime);

      if (inMinutes > STANDARD_START_MINUTES) {
        const late = inMinutes - STANDARD_START_MINUTES;
        if (late > permissibleLateMins) lateMinsTotal += late;
      }
    }

    if (status !== "M/WO-I") {
      const earlyDep = Number(day.attendance.earlyDep) || 0;
      earlyDepartureTotalMinutes += earlyDep;
    }
  });

  let totalBeforeRelaxation = lateMinsTotal + earlyDepartureTotalMinutes;

  if (getIsStaff(employee)) {
    totalBeforeRelaxation = Math.max(
      0,
      totalBeforeRelaxation - STAFF_RELAXATION_MINUTES
    );
  }

  return Math.round(totalBeforeRelaxation);
};

/* ============================================================
   Types
   ============================================================ */

interface LateComparisonData {
  empCode: string;
  empName: string;
  softwareTotalHours: number;
  hrLateHours: number | null;
  difference: number | string;
}

type SortColumn = keyof LateComparisonData;
type SortDirection = "asc" | "desc";

/* ============================================================
   Component
   ============================================================ */

export const LateComparison: React.FC = () => {
  const { excelData } = useExcel();

  const { getHRLateValue } = useHRLateLookup();
  const { isMaintenanceEmployee } = useMaintenanceDeductLookup();

  const [showTable, setShowTable] = useState(false);

  const categorizedData = useMemo(() => {
    if (!excelData || !excelData.employees || !showTable) return [];

    return excelData.employees.map((employee: EmployeeData) => {
      const isMaintenance = isMaintenanceEmployee(employee);

      const softwareTotalMinutes = calculateFinalSoftwareMinutes(
        employee,
        isMaintenance
      );

      const softwareTotalHours = Number((softwareTotalMinutes / 60).toFixed(2));

      const hrLateHours = getHRLateValue(employee);

      const difference =
        hrLateHours === null
          ? "N/A"
          : Number((softwareTotalHours - hrLateHours).toFixed(2));

      return {
        empCode: employee.empCode,
        empName: employee.empName,
        softwareTotalHours,
        hrLateHours,
        difference,
      };
    });
  }, [excelData, showTable, getHRLateValue, isMaintenanceEmployee]);

  const handleExportClick = () => {
    const exportData: LateComparisonExportData[] = categorizedData.map(
      (row) => ({
        ...row,
        DifferenceCategory: "",
      })
    );

    exportLateComparisonToExcel(exportData, "Late_Comparison.xlsx");
  };

  if (!excelData) return null;

  return (
    <div className="mt-8 pt-6 border-t border-gray-300">
      <div
        className="flex items-center justify-between mb-4 cursor-pointer"
        onClick={() => setShowTable(!showTable)}
      >
        <h3 className="text-lg font-bold text-gray-800">
          Late Arrival Comparison
        </h3>
        {showTable ? <ChevronUp /> : <ChevronDown />}
      </div>

      {showTable && (
        <div className="mt-6">
          <button
            onClick={handleExportClick}
            className="mb-4 px-4 py-2 bg-green-600 text-white rounded"
          >
            Export
          </button>

          <div className="max-h-[600px] overflow-y-auto border rounded-md">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">Emp Code</th>
                  <th className="px-4 py-3 text-left">Emp Name</th>
                  <th className="px-4 py-3 text-left">Software Hours</th>
                  <th className="px-4 py-3 text-left">HR Hours</th>
                  <th className="px-4 py-3 text-left">Difference</th>
                </tr>
              </thead>

              <tbody>
                {categorizedData.map((row, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-4 py-2">{row.empCode}</td>
                    <td className="px-4 py-2">{row.empName}</td>
                    <td className="px-4 py-2">
                      {row.softwareTotalHours}
                      <span className="text-xs text-gray-500 ml-2">
                        ({minutesToHHMM(row.softwareTotalHours * 60)})
                      </span>
                    </td>
                    <td className="px-4 py-2">{row.hrLateHours ?? "N/A"}</td>
                    <td className="px-4 py-2">{row.difference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
