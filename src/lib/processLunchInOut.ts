// processLunchInOutFile.ts
// Robust parser for "04. Lunch In-Out Time Sheet.xlsx" style reports.
// - Section-aware: detects new sections when "Company Name" row appears and builds per-section date->column maps.
// - Finds best date header row and in/out row per section.
// - Handles Excel date serials, time fractions, merged cells.
// - Infers IN/OUT types more reliably (uses header when available, else uses time ordering fallback).
// - Produces an array of employees with dailyPunches { date, punches: [{type, time}] }.
//
// Usage:
//   import { processLunchInOutFile, LunchInOutData } from "./processLunchInOutFile";
//   const result = await processLunchInOutFile(file);

import * as XLSX from "xlsx";

export interface LunchInOutData {
  empCode: string;
  empName: string;
  dailyPunches: {
    date: string;
    punches: Array<{
      type: "In" | "Out";
      time: string;
    }>;
  }[];
}

/* ---------- Utilities ---------- */

/** Convert an Excel serial (number) to JS Date.
 * Excel epoch: 1899-12-30 (serial 0) -> JS: (serial - 25569) * 86400 * 1000
 */
function excelSerialToJSDate(serial: number): Date {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms);
}

/** Normalize date object/string/number to "DD/MM/YYYY" string */
function formatDate(
  dateLike: Date | string | number | null | undefined
): string | null {
  if (dateLike == null) return null;

  if (dateLike instanceof Date && !isNaN(dateLike.getTime())) {
    const d = dateLike;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  if (typeof dateLike === "number") {
    // Could be an Excel serial (full date) or a time fraction (0.xxx)
    if (dateLike > 1) {
      // treat as full excel serial
      const d = excelSerialToJSDate(dateLike);
      return formatDate(d);
    }
    // If it's a fraction <= 1, it is a time-of-day, not a date header
    return null;
  }

  // string
  const s = String(dateLike).trim();
  // Try to parse common formats: "01/10/2025" or "2025-10-01" or "01-10-2025"
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    let year = dmy[3];
    if (year.length === 2) year = "20" + year;
    return `${day}/${month}/${year}`;
  }

  // ISO-like "2025-10-01 08:31:00" or "2025-10-01"
  const iso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (iso) {
    const year = iso[1];
    const month = iso[2].padStart(2, "0");
    const day = iso[3].padStart(2, "0");
    return `${day}/${month}/${year}`;
  }

  return null;
}

/** Normalize a time value (Date | number | string) to "HH:MM" or null */
function formatTime(
  timeLike: Date | number | string | null | undefined
): string | null {
  if (timeLike == null) return null;

  // Date object (may contain date+time)
  if (timeLike instanceof Date && !isNaN(timeLike.getTime())) {
    const hours = String(timeLike.getHours()).padStart(2, "0");
    const minutes = String(timeLike.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  if (typeof timeLike === "number") {
    // time fraction or excel datetime serial
    if (timeLike > 1) {
      const d = excelSerialToJSDate(timeLike);
      return formatTime(d);
    } else {
      const totalMinutes = Math.round(timeLike * 24 * 60);
      const hours = Math.floor(totalMinutes / 60) % 24;
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
        2,
        "0"
      )}`;
    }
  }

  // string: attempt to extract HH:MM
  const s = String(timeLike).trim();
  const isoTime = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (isoTime) {
    const hh = isoTime[1].padStart(2, "0");
    const mm = isoTime[2].padStart(2, "0");
    return `${hh}:${mm}`;
  }

  // "08:31 AM" etc.
  const timeWithMeridian = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (timeWithMeridian) {
    let hr = Number(timeWithMeridian[1]);
    const min = Number(timeWithMeridian[2]);
    const mer = (timeWithMeridian[3] || "").toUpperCase();
    if (mer === "PM" && hr < 12) hr += 12;
    if (mer === "AM" && hr === 12) hr = 0;
    return `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  return null;
}

function toMinutes(timeStr: string | null | undefined): number {
  if (!timeStr) return -1;
  const parts = timeStr.split(":").map((p) => Number(p));
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return -1;
  return parts[0] * 60 + parts[1];
}

/* ---------- Main Parser ---------- */

export async function processLunchInOutFile(
  file: File
): Promise<LunchInOutData[]> {
  console.log("Starting processing of lunch in-out file:", file.name);

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { cellDates: true, cellNF: true });
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];

  if (!ws || !ws["!ref"]) {
    throw new Error("Worksheet not found or empty");
  }

  const range = XLSX.utils.decode_range(ws["!ref"]);
  const maxRow = range.e.r;
  const maxCol = range.e.c;

  // raw cell accessor (v or w)
  const cellRaw = (r: number, c: number) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr];
    if (!cell) return null;
    return cell.v ?? cell.w ?? null;
  };

  // Detect rows that start a new section (we use: "Company Name" marks new section)
  const isSectionStartRow = (r: number) => {
    for (let c = 0; c <= Math.min(maxCol, 6); c++) {
      const v = cellRaw(r, c);
      if (!v) continue;
      const s = String(v).toUpperCase();
      if (s.includes("COMPANY NAME")) return true;
    }
    return false;
  };

  // Build sections by scanning all rows and breaking where "Company Name" occurs.
  type Section = {
    startRow: number;
    endRow: number;
    dateRow: number;
    inOutRow: number;
    colToDate: Map<number, string>;
    headerRow: number;
  };

  const sections: Section[] = [];
  let currentStart = 0;

  for (let r = 0; r <= maxRow; r++) {
    if (isSectionStartRow(r) && r !== currentStart) {
      sections.push({
        startRow: currentStart,
        endRow: r - 1,
        dateRow: -1,
        inOutRow: -1,
        colToDate: new Map(),
        headerRow: -1,
      });
      currentStart = r;
    }
  }
  // push final section
  sections.push({
    startRow: currentStart,
    endRow: maxRow,
    dateRow: -1,
    inOutRow: -1,
    colToDate: new Map(),
    headerRow: -1,
  });

  // For each section: find header (EMP CODE), best date row, best in/out row, and build col->date map
  for (const sec of sections) {
    // 1) find header row with EMP CODE inside this section
    let headerFound = -1;
    for (let r = sec.startRow; r <= sec.endRow; r++) {
      for (let c = 0; c <= Math.min(maxCol, 12); c++) {
        const v = cellRaw(r, c);
        if (!v) continue;
        const s = String(v).toUpperCase();
        if (
          s.includes("EMP CODE") ||
          (s.includes("EMPLOYEE") && s.includes("CODE"))
        ) {
          headerFound = r;
          break;
        }
      }
      if (headerFound !== -1) break;
    }

    // fallback: try to find a header near section start + 2..8
    if (headerFound === -1) {
      for (
        let r = sec.startRow;
        r <= Math.min(sec.startRow + 8, sec.endRow);
        r++
      ) {
        for (let c = 0; c <= Math.min(maxCol, 12); c++) {
          const v = cellRaw(r, c);
          if (!v) continue;
          const s = String(v).toUpperCase();
          if (s.includes("EMPLOYEE") || s.includes("EMP")) {
            headerFound = r;
            break;
          }
        }
        if (headerFound !== -1) break;
      }
    }

    if (headerFound === -1) {
      // no header in this section - skip
      sec.headerRow = -1;
      sec.dateRow = -1;
      sec.inOutRow = -1;
      sec.colToDate = new Map();
      continue;
    }
    sec.headerRow = headerFound;

    // 2) find best candidate date row ABOVE headerFound (but inside this section)
    let bestDateRow = -1;
    let bestDateScore = 0;
    for (let r = sec.startRow; r < sec.headerRow; r++) {
      let score = 0;
      for (let c = 0; c <= maxCol; c++) {
        const raw = cellRaw(r, c);
        if (raw == null) continue;
        if (formatDate(raw)) score++;
        else if (typeof raw === "number" && raw > 1 && formatDate(raw)) score++;
      }
      if (score > bestDateScore) {
        bestDateScore = score;
        bestDateRow = r;
      }
    }

    // fallback choose row just above header
    if (bestDateRow === -1 || bestDateScore < 1) {
      const guess = Math.max(sec.startRow, sec.headerRow - 2);
      bestDateRow = guess;
    }
    sec.dateRow = bestDateRow;

    // 3) find best in/out row between dateRow and headerRow
    let bestInOutRow = -1;
    let bestInOutScore = 0;
    for (
      let r = sec.dateRow;
      r <= Math.min(sec.headerRow + 1, sec.endRow);
      r++
    ) {
      let score = 0;
      for (let c = 0; c <= maxCol; c++) {
        const v = cellRaw(r, c);
        if (!v) continue;
        const s = String(v).toUpperCase().trim();
        if (s === "IN" || s === "OUT" || s === "I" || s === "O") score++;
      }
      if (score > bestInOutScore) {
        bestInOutScore = score;
        bestInOutRow = r;
      }
    }
    if (bestInOutRow === -1) {
      bestInOutRow = Math.min(sec.dateRow + 1, sec.headerRow);
    }
    sec.inOutRow = bestInOutRow;

    // 4) Build column -> date map for this section
    const colToDate = new Map<number, string>();
    let lastDate: string | null = null;
    for (let c = 0; c <= maxCol; c++) {
      const dateCellVal = cellRaw(sec.dateRow, c);
      const maybeDate = formatDate(dateCellVal);
      if (maybeDate) {
        lastDate = maybeDate;
      } else if (dateCellVal && typeof dateCellVal === "string") {
        const cleaned = String(dateCellVal).replace(/\n/g, " ").trim();
        const p = formatDate(cleaned);
        if (p) lastDate = p;
      } else if (typeof dateCellVal === "number" && dateCellVal > 1) {
        const p = formatDate(dateCellVal);
        if (p) lastDate = p;
      }

      if (!lastDate) continue;

      // check for in/out label at inOutRow (or fallback inOutRow+1)
      const inOutVal = cellRaw(sec.inOutRow, c);
      if (inOutVal) {
        const s = String(inOutVal).trim().toUpperCase();
        if (s === "IN" || s === "OUT" || s === "I" || s === "O") {
          colToDate.set(c, lastDate);
          continue;
        }
      }
      // alt row below
      const alt = cellRaw(sec.inOutRow + 1, c);
      if (alt) {
        const s2 = String(alt).trim().toUpperCase();
        if (s2 === "IN" || s2 === "OUT" || s2 === "I" || s2 === "O") {
          colToDate.set(c, lastDate);
          continue;
        }
      }

      // Heuristic: if the employee data rows (below header) contain values in this column for many rows,
      // we can still treat it as a mapped column. We'll not aggressively add here to avoid false positives.
    }

    sec.colToDate = colToDate;
  } // end sections loop

  // Now parse employees section-by-section using the corresponding section.colToDate map.
  const employees: LunchInOutData[] = [];

  // Helper to find empCode/empName columns inside header row
  const detectEmpCols = (headerRow: number) => {
    let empCodeCol = -1;
    let empNameCol = -1;
    if (headerRow < 0) return { empCodeCol: -1, empNameCol: -1 };
    for (let c = 0; c <= Math.min(maxCol, 20); c++) {
      const v = cellRaw(headerRow, c);
      if (!v) continue;
      const s = String(v).toUpperCase();
      if (
        empCodeCol === -1 &&
        (s.includes("EMP CODE") || s.includes("EMPLOYEE CODE") || s === "CODE")
      ) {
        empCodeCol = c;
      }
      if (
        empNameCol === -1 &&
        (s.includes("EMPLOYEE") ||
          s.includes("EMP NAME") ||
          s.includes("EMPLOYEE NAME") ||
          s === "NAME")
      ) {
        empNameCol = c;
      }
    }
    // fallback defaults
    if (empCodeCol === -1) empCodeCol = 0;
    if (empNameCol === -1) empNameCol = Math.min(1, maxCol);
    return { empCodeCol, empNameCol };
  };

  for (const sec of sections) {
    if (sec.headerRow === -1) continue; // no header -> skip
    if (!sec.colToDate || sec.colToDate.size === 0) {
      // skip sections without mapping
      continue;
    }

    const { empCodeCol, empNameCol } = detectEmpCols(sec.headerRow);

    // iterate employee rows: start after header row and continue until section end or long blank run
    const maxConsecutiveBlank = 18;
    let consecutiveBlank = 0;

    for (let r = sec.headerRow + 1; r <= sec.endRow; r++) {
      const empCodeVal = cellRaw(r, empCodeCol);
      const empNameVal = cellRaw(r, empNameCol);

      if (
        (!empCodeVal || String(empCodeVal).trim() === "") &&
        (!empNameVal || String(empNameVal).trim() === "")
      ) {
        consecutiveBlank++;
        if (consecutiveBlank >= maxConsecutiveBlank) break;
        continue;
      }
      consecutiveBlank = 0;

      const empCode = empCodeVal ? String(empCodeVal).trim() : "";
      const empName = empNameVal ? String(empNameVal).trim() : "";

      // Skip rows that appear to be repeated headers
      const bigUpper = (empCode + " " + empName).toUpperCase();
      if (bigUpper.includes("EMP") && bigUpper.includes("CODE")) continue;

      // Group punches by date for this employee
      const dateGroups = new Map<
        string,
        Array<{ type: "In" | "Out"; time: string; col: number }>
      >();

      // Iterate section-specific mapped columns
      for (const [col, dateStr] of sec.colToDate.entries()) {
        const addr = XLSX.utils.encode_cell({ r, c: col });
        const cell = ws[addr];
        const rawVal = cell?.v ?? cell?.w ?? null;

        if (rawVal == null) continue;

        let timeStr = formatTime(rawVal);
        if (!timeStr && cell?.w) {
          // sometimes formatting puts time into .w; try that
          timeStr = formatTime(cell.w);
        }

        if (!timeStr) {
          // can't parse time, skip
          continue;
        }

        // determine type from header cell at sec.inOutRow (and fallback to inOutRow+1)
        let typeGuess: "In" | "Out" = "In";
        const headerCell = cellRaw(sec.inOutRow, col);
        const headerCell2 = cellRaw(sec.inOutRow + 1, col);
        let headerStr: string | null = null;
        if (headerCell != null)
          headerStr = String(headerCell).trim().toUpperCase();
        else if (headerCell2 != null)
          headerStr = String(headerCell2).trim().toUpperCase();

        if (headerStr) {
          // explicit label present — use it (robustly)
          if (headerStr.startsWith("O") || headerStr === "OUT")
            typeGuess = "Out";
          else typeGuess = "In";
        } else {
          // NO explicit header label — fallback inference by time order within this date
          // Get all mapped columns for this date, sorted
          const allColsForDate: number[] = [];
          for (const [cc, ds] of sec.colToDate.entries()) {
            if (ds === dateStr) allColsForDate.push(cc);
          }
          allColsForDate.sort((a, b) => a - b);
          const idx = allColsForDate.indexOf(col);

          if (idx === 0) {
            // first mapped column for the date → treat as IN
            typeGuess = "In";
          } else if (idx > 0) {
            // compare with previous column's time
            const prevCol = allColsForDate[idx - 1];
            const prevAddr = XLSX.utils.encode_cell({ r, c: prevCol });
            const prevCell = ws[prevAddr];
            const prevRaw = prevCell?.v ?? prevCell?.w ?? null;
            const prevTimeStr =
              formatTime(prevRaw) ??
              (prevCell?.w ? formatTime(prevCell.w) : null);

            const thisMins = toMinutes(timeStr);
            const prevMins = toMinutes(prevTimeStr);

            if (prevMins >= 0 && thisMins >= 0) {
              // if time increased relative to previous -> Out, else In (handles weird duplicates)
              typeGuess = thisMins > prevMins ? "Out" : "In";
            } else {
              // as last fallback, use parity (even => In, odd => Out)
              typeGuess = idx % 2 === 0 ? "In" : "Out";
            }
          } else {
            // column not found in array (shouldn't happen) -> fallback parity by col index
            typeGuess = col % 2 === 0 ? "In" : "Out";
          }
        }

        if (!dateGroups.has(dateStr)) dateGroups.set(dateStr, []);
        dateGroups.get(dateStr)!.push({ type: typeGuess, time: timeStr, col });
      } // end col loop

      // Normalize groups by sorting by column index
      const dailyPunches: LunchInOutData["dailyPunches"] = [];
      for (const [dateKey, punchesWithCol] of dateGroups.entries()) {
        const punches = punchesWithCol
          .sort((a, b) => a.col - b.col)
          .map((p) => ({ type: p.type as "In" | "Out", time: p.time }));
        if (punches.length > 0) {
          dailyPunches.push({ date: dateKey, punches });
        }
      }

      if (dailyPunches.length > 0) {
        employees.push({
          empCode,
          empName,
          dailyPunches,
        });
      } else {
        // no punches for this employee in this section - skip
      }
    } // end rows inside section
  } // end sections

  console.log(`Processed employees: ${employees.length}`);
  return employees;
}
