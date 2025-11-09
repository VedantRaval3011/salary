"use client";

import { useMemo } from "react";
import { useExcel } from "../context/ExcelContext"; // Changed to relative path
import { EmployeeData } from "../lib/types"; // Changed to relative path

// --- HELPER FUNCTIONS ---2
const canon = (s: string) => (s ?? "").toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => (String(s).match(/\d+/g) || []).join("");
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");
const nameKey = (s: string): string => {
  const cleaned = canon(s).replace(/[^A-Z0-9\s]/g, ""); // Keep spaces
  return cleaned.split(/\s+/).sort().join(""); // Split by space, sort, join
};
// --- END HELPERS ---

export function useHROTLookup() {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];

    const hrFiles = files.filter(
      (f: any) =>
        f.status === "success" &&
        (f.categoryName === "Staff Tulsi" ||
          f.categoryName === "Worker Tulsi") &&
        Array.isArray(f.hrData)
    );

    const allHREmployees = hrFiles.flatMap((f: any) => f.hrData);

    if (allHREmployees.length === 0) {
      console.log("⚠️ No HR files loaded or hrData is empty for OT lookup");
      return { getHROTValue: () => null };
    }

    console.log(
      `✅ Building HR OT lookup from ${allHREmployees.length} total records.`
    );

    const employeeByCode = new Map<string, number>();
    const employeeByName = new Map<string, number>();

    for (const emp of allHREmployees) {
      // --- THIS IS THE FIX ---
      // The CSV header is "OT" for both Staff (Col I) and Worker (Col F).
      // We check for "OT" (uppercase) and "ot" (lowercase)
      const otValue = emp.OT ?? emp.ot ?? emp.otHours ?? emp.otHrs ?? 0;
      const otHours = Number(otValue) || 0;
      // --- END OF FIX ---

      if (emp.empCode) {
        const codeStr = String(emp.empCode);
        const codeKey = stripNonAlnum(codeStr);
        const numKey = numericOnly(codeStr);
        const numKeyStripped = dropLeadingZeros(numKey);

        // Only set if value is not 0, or if you want to explicitly store 0s
        // Storing 0s is fine here.
        employeeByCode.set(codeKey, otHours);
        if (numKey) employeeByCode.set(numKey, otHours);
        if (numKeyStripped) employeeByCode.set(numKeyStripped, otHours);
      }

      if (emp.empName) {
        const nKey = nameKey(emp.empName);
        if (nKey) employeeByName.set(nKey, otHours);
      }
    }

    const getHROTValue = (
      emp: Pick<EmployeeData, "empCode" | "empName">
    ): number | null => {
      const codeStr = String(emp.empCode);
      const nameStr = String(emp.empName);

      const codeKey = stripNonAlnum(codeStr);
      const numKey = numericOnly(codeStr);
      const numKeyStripped = dropLeadingZeros(numKey);
      const nKey = nameKey(nameStr);

      let found = employeeByCode.get(numKeyStripped);
      if (found === undefined) found = employeeByCode.get(numKey);
      if (found === undefined) found = employeeByCode.get(codeKey);
      if (found === undefined && nKey) found = employeeByName.get(nKey);

      if (found === undefined) {
        // console.warn(`❌ No HR OT match for: code="${codeStr}", name="${nameStr}"`);
      }

      // Return the found value (which could be 0) or null if not found
      return found ?? null;
    };

    return { getHROTValue };
  }, [getAllUploadedFiles]);
}