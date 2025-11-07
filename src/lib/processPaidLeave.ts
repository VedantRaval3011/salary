import * as ExcelJS from "exceljs";
import { PaidLeaveData } from "@/lib/types";

// Safe cell → string
function cellValueToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((rt: any) => rt.text).join("");
    if ("result" in value) return String((value as any).result ?? "");
    if ("text" in value) return String((value as any).text ?? "");
    if ("error" in value) return String((value as any).error ?? "");
  }
  return String(value);
}

const normHeader = (h: string) => h.replace(/[^a-z0-9]/gi, "").toLowerCase();

/**
 * Header-name driven parser for Staff Paid Leave.
 * Finds headers for Emp Code, Name, and Paid Days (PL) regardless of order/column.
 */
export async function processPaidLeaveFile(file: File): Promise<PaidLeaveData[]> {
  try {
    if (file.size === 0) throw new Error("File is empty");
    if (file.size > 10 * 1024 * 1024) throw new Error("File size exceeds 10MB limit");

    const arrayBuffer = await file.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Failed to read file contents");
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    if (!wb.worksheets.length) throw new Error("No worksheets found in the Excel file");

    const ws = wb.worksheets[0];
    if (!ws.actualRowCount) throw new Error("The worksheet is empty");

    // Discover the header row & column indices by name
    let headerRow = 0;
    let colEmpCode = 0,
      colEmpName = 0,
      colPaidDays = 0;

    const want = {
      code: ["empcode", "ecode", "employeeid", "code", "empno", "employeeecode"],
      name: ["name", "empname", "employeename"],
      paid: ["paiddays", "paidday", "paid", "pldays", "pl", "paidleavedays"],
    };

    const maxHeaderScan = Math.min(ws.actualRowCount, 20);
    for (let r = 1; r <= maxHeaderScan; r++) {
      const row = ws.getRow(r);
      let foundCode = 0,
        foundName = 0,
        foundPaid = 0;

      row.eachCell((cell, c) => {
        const h = normHeader(cellValueToString(cell.value));
        if (!foundCode && want.code.some((k) => h.includes(k))) foundCode = c;
        if (!foundName && want.name.some((k) => h.includes(k))) foundName = c;
        if (!foundPaid && want.paid.some((k) => h.includes(k))) foundPaid = c;
      });

      if (foundCode && foundName && foundPaid) {
        headerRow = r;
        colEmpCode = foundCode;
        colEmpName = foundName;
        colPaidDays = foundPaid;
        break;
      }
    }

    if (!headerRow) {
      throw new Error("Could not find headers for Emp Code / Name / Paid Days in the paid leave sheet");
    }

    const out: PaidLeaveData[] = [];
    for (let r = headerRow + 1; r <= ws.actualRowCount; r++) {
      const row = ws.getRow(r);
      const empCode = cellValueToString(row.getCell(colEmpCode).value).trim();
      const empName = cellValueToString(row.getCell(colEmpName).value).trim();
      const paidRaw = cellValueToString(row.getCell(colPaidDays).value).trim();

      // Skip empty or separator rows
      if (!empCode && !empName && !paidRaw) continue;

      // Need at least an emp code to match later
      if (!empCode) continue;

      const paidDays = paidRaw && !isNaN(Number(paidRaw)) ? Number(paidRaw) : 0;
      out.push({ empCode, empName, paidDays });
    }

    return out;
  } catch (error: any) {
    const msg = error?.message || "Unknown error";
    throw new Error(`Failed to process paid leave file: ${msg}`);
  }
}
