// hooks/useHRDataLookup.ts
import { useMemo } from "react";
import { useExcel } from "@/context/ExcelContext";
import { EmployeeData } from "@/lib/types";

// --- HELPER FUNCTIONS ---
const canon = (s: string) => (s ?? "").toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => (String(s).match(/\d+/g) || []).join("");
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");

/**
 * Sorts name parts to handle "First Last" vs "Last, First"
 * e.g., nameKey("ASHOK MARYA") => "ASHOKMARYA"
 * e.g., nameKey("MARYA, ASHOK") => "ASHOKMARYA"
 */
const nameKey = (s: string): string => {
  const cleaned = canon(s).replace(/[^A-Z0-9\s]/g, ""); // Keep spaces
  return cleaned.split(/\s+/).sort().join(""); // Split by space, sort, join
};
// --- END HELPERS ---

export function useHRDataLookup() {
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
      console.log("⚠️ No HR files loaded or hrData is empty");
      return { getHRPresentDays: () => null };
    }

    console.log(
      `✅ Building HR lookup from ${allHREmployees.length} total records.`
    );

    // Debug: Log the HR files found
    console.log("📊 HR Files found:", hrFiles.map(f => ({
      name: f.fileName,
      category: f.categoryName,
      hrDataLength: f.hrData?.length,
      sampleEmployee: f.hrData?.[0]
    })));

    const employeeByCode = new Map<string, { presentDays: number; day: number }>();
    const employeeByName = new Map<string, { presentDays: number; day: number }>();

    // --- BUILD THE MAPS (STORING DATA) ---
    for (const emp of allHREmployees) {
      // Get both presentDays (Adj Days / Column X) and day (Day column)
      const presentDays = Number(emp.presentDays) || 0;
      const day = Number(emp.day) || Number(emp.Day) || 0;

      const hrData = { presentDays, day };

      if (emp.empCode) {
        const codeStr = String(emp.empCode);
        const codeKey = stripNonAlnum(codeStr); // "E-848" -> "E848"
        const numKey = numericOnly(codeStr); // "E-848" -> "848"
        const numKeyStripped = dropLeadingZeros(numKey); // "0041" -> "41"

        // Store all variations
        employeeByCode.set(codeKey, hrData);
        if (numKey) employeeByCode.set(numKey, hrData);
        if (numKeyStripped) employeeByCode.set(numKeyStripped, hrData);
      }

      if (emp.empName) {
        const nKey = nameKey(emp.empName); // "MARYA, ASHOK" -> "ASHOKMARYA"
        if (nKey) employeeByName.set(nKey, hrData);
      }
    }

    console.log(
      `📋 HR Lookup Maps built: ${employeeByCode.size} code keys, ${employeeByName.size} name keys.`
    );

    // Debug: Show some sample mappings
    console.log("🔍 Sample code mappings:", 
      Array.from(employeeByCode.entries()).slice(0, 5)
    );
    console.log("🔍 Sample name mappings:", 
      Array.from(employeeByName.entries()).slice(0, 5)
    );

    // --- RETURN THE LOOKUP FUNCTION ---
    const getHRPresentDays = (
      emp: Pick<EmployeeData, "empCode" | "empName">
    ): number | null => {
      const codeStr = String(emp.empCode);
      const nameStr = String(emp.empName);

      // 1. Generate all possible keys from the main attendance file
      const codeKey = stripNonAlnum(codeStr); // e.g., "E848"
      const numKey = numericOnly(codeStr); // e.g., "848"
      const numKeyStripped = dropLeadingZeros(numKey); // e.g., "41"
      const nKey = nameKey(nameStr); // e.g., "ASHOKMARYA"

      // Debug: Log the keys being searched for the first few employees
      if (Math.random() < 0.05) { // Log ~5% of lookups to avoid spam
        console.log(`🔎 Looking up employee: code="${codeStr}", name="${nameStr}"`);
        console.log(`   Generated keys: numKeyStripped="${numKeyStripped}", numKey="${numKey}", codeKey="${codeKey}", nameKey="${nKey}"`);
      }

      // 2. Try matching in order of priority
      // Most specific (numeric only, no zeros)
      let found = employeeByCode.get(numKeyStripped);

      // Numeric with zeros
      if (found === undefined) found = employeeByCode.get(numKey);

      // Alphanumeric
      if (found === undefined) found = employeeByCode.get(codeKey);

      // Name (last resort)
      if (found === undefined && nKey) found = employeeByName.get(nKey);

      if (found === undefined) {
        console.warn(`❌ No HR match found for: code="${codeStr}", name="${nameStr}"`);
        return null;
      }

      // ⭐ Return presentDays if available, otherwise fallback to day
      // This handles the case where "Adj Days" (Column X) is empty but "Day" column has data
      const result = found.presentDays > 0 ? found.presentDays : found.day;
      
      return result > 0 ? result : null;
    };

    return { getHRPresentDays };
  }, [getAllUploadedFiles]);
}