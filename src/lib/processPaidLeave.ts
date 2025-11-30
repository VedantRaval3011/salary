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
 * Finds Paid Days + ADJ. DAYS + LEAVE column
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

    let headerRow = 0;
    let colEmpCode = 0,
      colEmpName = 0,
      colPaidDays = 0,
      colAdjDays = 0,
      colLeave = 0; // 🔥 NEW Leave column

    const want = {
      code: ["empcode", "ecode", "employeeid", "code", "empno", "employeeecode"],
      name: ["name", "empname", "employeename"],
      paid: ["paiddays", "paidday", "paid", "pldays", "pl", "paidleavedays"],
      adjDays: ["adjdays", "adjday", "adjustmentdays", "adj.p", "adjp", "adjday"],
      leave: ["leave", "leavedays", "lv", "el", "sl", "cl", "leavefth", "fth", "leavefthcolumn"], // 🔥 Leave column matching
    };

    const maxHeaderScan = Math.min(ws.actualRowCount, 20);
    for (let r = 1; r <= maxHeaderScan; r++) {
      const row = ws.getRow(r);
      let foundCode = 0,
        foundName = 0,
        foundPaid = 0,
        foundAdjDays = 0,
        foundLeave = 0;

      row.eachCell((cell, c) => {
        const h = normHeader(cellValueToString(cell.value));
        if (!foundCode && want.code.some((k) => h.includes(k))) foundCode = c;
        if (!foundName && want.name.some((k) => h.includes(k))) foundName = c;
        if (!foundPaid && want.paid.some((k) => h.includes(k))) foundPaid = c;
        if (!foundAdjDays && want.adjDays.some((k) => h.includes(k))) foundAdjDays = c;
        if (!foundLeave && want.leave.some((k) => h.includes(k))) foundLeave = c;
      });

      if (foundCode && foundName && foundPaid) {
        headerRow = r;
        colEmpCode = foundCode;
        colEmpName = foundName;
        colPaidDays = foundPaid;
        colAdjDays = foundAdjDays;
        colLeave = foundLeave; // NEW
        break;
      }
    }

    if (!headerRow) {
      throw new Error("Could not find required headers in Paid Leave sheet");
    }

    console.log(
      `📌 Paid Leave Columns → Code:${colEmpCode} Name:${colEmpName} Paid:${colPaidDays} ADJ:${colAdjDays || "N/A"} Leave:${colLeave || "N/A"}`
    );

    const out: PaidLeaveData[] = [];
    for (let r = headerRow + 1; r <= ws.actualRowCount; r++) {
      const row = ws.getRow(r);
      const empCode = cellValueToString(row.getCell(colEmpCode).value).trim();
      const empName = cellValueToString(row.getCell(colEmpName).value).trim();
      const paidRaw = cellValueToString(row.getCell(colPaidDays).value).trim();

      if (!empCode && !empName && !paidRaw) continue;
      if (!empCode) continue;

      const paidDays = paidRaw && !isNaN(Number(paidRaw)) ? Number(paidRaw) : 0;

      const adjDaysRaw = colAdjDays ? cellValueToString(row.getCell(colAdjDays).value).trim() : "";
      const adjDays = adjDaysRaw && !isNaN(Number(adjDaysRaw)) ? Number(adjDaysRaw) : 0;

      const leaveRaw = colLeave ? cellValueToString(row.getCell(colLeave).value).trim() : "";
      const leaveDays = leaveRaw && !isNaN(Number(leaveRaw)) ? Number(leaveRaw) : 0;

      const record: PaidLeaveData = { empCode, empName, paidDays };

      if (adjDays > 0) record.adjDays = adjDays;
      if (leaveDays !== 0) record.leave = leaveDays; // Include negative and positive values

      out.push(record);
    }

    console.log(
      `✔ Processed ${out.length} employees → ADJ Found: ${
        out.filter((e) => e.adjDays).length
      } Leave Found: ${out.filter((e) => e.leave).length}`
    );

    return out;
  } catch (error: any) {
    throw new Error(`Failed to process paid leave file: ${error.message}`);
  }
}
