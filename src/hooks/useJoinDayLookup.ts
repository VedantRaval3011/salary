// hooks/useJoinDayLookup.ts
import { useMemo } from "react";
import { useExcel } from "@/context/ExcelContext";
import { EmployeeData } from "@/lib/types";

const stripNonAlnum = (s: string) =>
  (s ?? "").toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
const numericOnly = (s: string) => (String(s).match(/\d+/g) || []).join("");
const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");

/**
 * Day of month an employee joined, from the DOJ column of the Staff/Worker Tulsi
 * HR files. Returns null unless the DOJ falls inside the salary month.
 * Employees who join mid-month get no paid leave and no paid holidays before joining.
 */
export function useJoinDayLookup() {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
    const byCode = new Map<string, number>();

    for (const file of files as any[]) {
      if (
        file.status !== "success" ||
        (file.categoryName !== "Staff Tulsi" && file.categoryName !== "Worker Tulsi") ||
        !Array.isArray(file.hrData)
      )
        continue;
      for (const emp of file.hrData) {
        if (!emp.joinDay || !emp.empCode) continue;
        const code = String(emp.empCode);
        const num = numericOnly(code);
        byCode.set(stripNonAlnum(code), emp.joinDay);
        if (num) {
          byCode.set(num, emp.joinDay);
          byCode.set(dropLeadingZeros(num), emp.joinDay);
        }
      }
    }

    const getJoinDay = (emp: Pick<EmployeeData, "empCode">): number | null => {
      const code = String(emp.empCode ?? "");
      const num = numericOnly(code);
      return (
        byCode.get(dropLeadingZeros(num)) ??
        byCode.get(num) ??
        byCode.get(stripNonAlnum(code)) ??
        null
      );
    };

    /** True when the employee joined after the 1st of the salary month. */
    const joinedMidMonth = (emp: Pick<EmployeeData, "empCode">): boolean =>
      (getJoinDay(emp) ?? 1) > 1;

    return { getJoinDay, joinedMidMonth };
  }, [getAllUploadedFiles]);
}
