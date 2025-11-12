"use client";

import { useMemo } from "react";
import { useExcel } from "../context/ExcelContext";
import { EmployeeData } from "../lib/types";

type FlexibleHRData = {
  empCode: string;
  empName: string;
  [key: string]: any;
};

// --- HELPER FUNCTIONS ---
const canon = (s: string) => (s ?? "").toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => (String(s).match(/\d+/g) || []).join("");
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");
const nameKey = (s: string): string => {
  const cleaned = canon(s).replace(/[^A-Z0-9\s]/g, "");
  return cleaned.split(/\s+/).sort().join("");
};
// --- END HELPERS ---

/**
 * Hook to create a memoized lookup function for retrieving Late hours from
 * HR data based on employee code or name.
 */
export function useHRLateLookup() {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];

    // EXTENSIVE DEBUGGING
    console.log("\n🔍 ===== HR LATE LOOKUP DEBUG START =====");
    console.log("📁 Total files available:", files.length);

    files.forEach((file: any, index: number) => {
      console.log(`\n📄 File ${index + 1}:`, {
        fileName: file.fileName,
        categoryName: file.categoryName,
        fileType: file.fileType,
        status: file.status,
        hasHRData: !!file.hrData,
        hrDataIsArray: Array.isArray(file.hrData),
        hrDataLength: Array.isArray(file.hrData) ? file.hrData.length : 0,
      });
    });

    // Filter for successfully uploaded Staff and Worker Tulsi files
    const hrFiles = files.filter(
      (f: any) =>
        f.status === "success" &&
        (f.categoryName === "Staff Tulsi" ||
          f.categoryName === "Worker Tulsi") &&
        Array.isArray(f.hrData)
    );

    console.log("\n✅ Filtered HR files count:", hrFiles.length);
    hrFiles.forEach((file: any, index: number) => {
      console.log(`HR File ${index + 1}:`, {
        categoryName: file.categoryName,
        hrDataLength: file.hrData.length,
      });
    });

    let employeesWithLateData: any[] = [];

    // CRITICAL: Iterate over files first to apply category-specific column mapping
    for (const file of hrFiles) {
      const isStaff = file.categoryName === "Staff Tulsi";

      if (Array.isArray(file.hrData)) {
        // Debug: Log the first employee's keys to see the structure
        if (file.hrData.length > 0) {
          const firstEmp = file.hrData[0] as FlexibleHRData;
          const allKeys = Object.keys(firstEmp);
          console.log(
            `\n=== ${isStaff ? "STAFF" : "WORKER"} LATE FILE KEYS ===`
          );
          console.log("Total columns:", allKeys.length);
          console.log("All keys:", allKeys);
          console.log("Key at index 11 (Column L):", allKeys[11]);
          console.log("Key at index 6 (Column G):", allKeys[6]);
          console.log(
            'Keys containing "LATE":',
            allKeys.filter((k) => k.toUpperCase().includes("LATE"))
          );
          console.log("================================\n");
        }

        for (const rawEmp of file.hrData) {
          const emp = rawEmp as FlexibleHRData;

          // SIMPLIFIED: Just use the Late field that was extracted by processHRFile
          const lateValue = emp.Late ?? 0;
          const lateHours = Number(lateValue) || 0;

          // Debug first few employees
          if (file.hrData.indexOf(rawEmp) < 3) {
            console.log(
              `${isStaff ? "Staff" : "Worker"} ${emp.empCode} Late:`,
              {
                empCode: emp.empCode,
                empName: emp.empName,
                Late: emp.Late,
                lateHours,
              }
            );
          }

          employeesWithLateData.push({
            ...emp,
            lateHours: lateHours,
          });
        }
      }
    }

    if (employeesWithLateData.length === 0) {
      console.log("⚠️ No HR files loaded or hrData is empty for Late lookup");
      console.log("🔍 ===== HR LATE LOOKUP DEBUG END =====\n");
      return { getHRLateValue: () => null };
    }

    console.log(
      `✅ Building HR Late lookup from ${employeesWithLateData.length} total records.`
    );

    const employeeByCode = new Map<string, number>();
    const employeeByName = new Map<string, number>();

    // Now populate the lookup maps using the standardized 'lateHours' field
    for (const emp of employeesWithLateData) {
      const lateHours = emp.lateHours;

      if (emp.empCode) {
        const codeStr = String(emp.empCode);
        const codeKey = stripNonAlnum(codeStr);
        const numKey = numericOnly(codeStr);
        const numKeyStripped = dropLeadingZeros(numKey);

        employeeByCode.set(codeKey, lateHours);
        if (numKey) employeeByCode.set(numKey, lateHours);
        if (numKeyStripped) employeeByCode.set(numKeyStripped, lateHours);
      }

      if (emp.empName) {
        const nKey = nameKey(emp.empName);
        if (nKey) employeeByName.set(nKey, lateHours);
      }
    }

    console.log("📊 Lookup Map Stats:");
    console.log("  - Employee codes indexed:", employeeByCode.size);
    console.log("  - Employee names indexed:", employeeByName.size);

    // Sample some entries
    const sampleCodes = Array.from(employeeByCode.entries()).slice(0, 3);
    console.log("  - Sample code entries:", sampleCodes);

    console.log("🔍 ===== HR LATE LOOKUP DEBUG END =====\n");

    /**
     * Retrieves the Late hours for an employee using various lookup keys.
     * @param emp Employee object with empCode and empName.
     * @returns Late hours (number) or null if no match is found.
     */
    const getHRLateValue = (
      emp: Pick<EmployeeData, "empCode" | "empName">
    ): number | null => {
      const codeStr = String(emp.empCode);
      const nameStr = String(emp.empName);

      const codeKey = stripNonAlnum(codeStr);
      const numKey = numericOnly(codeStr);
      const numKeyStripped = dropLeadingZeros(numKey);
      const nKey = nameKey(nameStr);

      // Debug first lookup attempt

      // Lookup priority: Stripped Numeric Code -> Full Numeric Code -> Alphanumeric Code -> Name
      let found = employeeByCode.get(numKeyStripped);
      if (found === undefined) found = employeeByCode.get(numKey);
      if (found === undefined) found = employeeByCode.get(codeKey);
      if (found === undefined && nKey) found = employeeByName.get(nKey);

      // Return the found value (which could be 0) or null if not found
      return found ?? null;
    };

    // Add debug property to track calls
    (getHRLateValue as any)._debugCount = 0;

    return { getHRLateValue };
  }, [getAllUploadedFiles]);
}
