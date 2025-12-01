// processLunchInOutFile.ts
// Robust parser for "04. Lunch In-Out Time Sheet.xlsx" style reports.

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

function excelSerialToJSDate(serial: number): Date {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms);
}

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
    if (dateLike > 1) {
      const d = excelSerialToJSDate(dateLike);
      return formatDate(d);
    }
    return null;
  }

  const s = String(dateLike).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    let year = dmy[3];
    if (year.length === 2) year = "20" + year;
    return `${day}/${month}/${year}`;
  }

  const iso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (iso) {
    const year = iso[1];
    const month = iso[2].padStart(2, "0");
    const day = iso[3].padStart(2, "0");
    return `${day}/${month}/${year}`;
  }

  return null;
}

function formatTime(
  timeLike: Date | number | string | null | undefined
): string | null {
  if (timeLike == null) return null;

  if (timeLike instanceof Date && !isNaN(timeLike.getTime())) {
    const totalMinutes = Math.round(
      timeLike.getHours() * 60 +
        timeLike.getMinutes() +
        timeLike.getSeconds() / 60
    );
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}`;
  }

  if (typeof timeLike === "number") {
    if (timeLike > 1) {
      const d = excelSerialToJSDate(timeLike);
      return formatTime(d);
    } else {
      const totalMinutes = Math.round(timeLike * 1440);
      const hours = Math.floor(totalMinutes / 60) % 24;
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
        2,
        "0"
      )}`;
    }
  }

  const s = String(timeLike).trim();
  const isoTime = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (isoTime) {
    const hh = isoTime[1].padStart(2, "0");
    const mm = isoTime[2].padStart(2, "0");
    return `${hh}:${mm}`;
  }

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

  const cellRaw = (r: number, c: number) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr];
    if (!cell) return null;
    return cell.v ?? cell.w ?? null;
  };

  const isSectionStartRow = (r: number) => {
    for (let c = 0; c <= 8; c++) {
      const v = cellRaw(r, c);
      if (!v) continue;
      const s = String(v).toUpperCase();
      
      if (s.includes("COMPANY NAME") || s.includes("DEPARTMENT :") || s.includes("DEPARTMENT:")) {
        const lookAheadRows = 8;
        let foundHeaderOrData = false;
        for (let rr = r + 1; rr <= Math.min(r + lookAheadRows, maxRow); rr++) {
          for (let cc = 0; cc <= Math.min(maxCol, 20); cc++) {
            const vv = cellRaw(rr, cc);
            if (!vv) continue;
            const ss = String(vv).trim();
            if (
              /EMP/i.test(ss) ||
              /\d{1,2}:\d{2}/.test(ss) || 
              /^[A-Za-z .,'\-]{3,}$/.test(ss) 
            ) {
              foundHeaderOrData = true;
              break;
            }
          }
          if (foundHeaderOrData) break;
        }
        return foundHeaderOrData;
      }
    }
    for (let c = 0; c <= 8; c++) {
      const v = cellRaw(r, c);
      if (!v) continue;
      const s = String(v).toUpperCase().trim();
      if (s.includes("EMP CODE") || s.includes("EMPLOYEE")) return true;
    }
    return false;
  };

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
    if (isSectionStartRow(r) && r > currentStart + 2) {
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
  sections.push({
    startRow: currentStart,
    endRow: maxRow,
    dateRow: -1,
    inOutRow: -1,
    colToDate: new Map(),
    headerRow: -1,
  });

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    
    let headerFound = -1;
    for (let r = sec.startRow; r <= sec.endRow; r++) {
      for (let c = 0; c <= Math.min(maxCol, 20); c++) {
        const v = cellRaw(r, c);
        if (!v) continue;
        const s = String(v).toUpperCase();
        if (
          s.includes("EMP CODE") ||
          s.includes("EMPLOYEE CODE") ||
          s.includes("EMPLOYEE NAME") ||
          s.includes("EMP NAME") ||
          (s.includes("EMP") && (s.includes("CODE") || s.includes("NAME")))
        ) {
          headerFound = r;
          break;
        }
      }
      if (headerFound !== -1) break;
    }

    if (headerFound === -1) {
      for (
        let r = sec.startRow;
        r <= Math.min(sec.startRow + 18, sec.endRow);
        r++
      ) {
        let score = 0;
        for (let c = 0; c <= Math.min(maxCol, 30); c++) {
          const v = cellRaw(r + 1, c); 
          if (!v) continue;
          const s = String(v).trim();
          if (/^[A-Za-z ]{3,}$/.test(s)) score += 1; 
          if (/\d{1,2}:\d{2}/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s))
            score += 2; 
        }
        if (score >= 3) {
          headerFound = r;
          break;
        }
      }
    }

    if (headerFound === -1) {
      headerFound = Math.min(sec.startRow + 6, sec.endRow);
    }
    sec.headerRow = headerFound;

    function getCellValueResolved(r: number, c: number) {
      const addr = XLSX.utils.encode_cell({ r, c });
      let cell = ws[addr];
      if (cell && cell.v !== undefined) return cell.v ?? cell.w ?? null;

      const merges = ws["!merges"] || [];
      for (const m of merges) {
        if (r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c) {
          const masterAddr = XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c });
          const masterCell = ws[masterAddr];
          return masterCell?.v ?? masterCell?.w ?? null;
        }
      }
      return null;
    }

    let bestDateRow = -1;
    let bestDateScore = 0;
    for (let r = sec.startRow; r <= sec.endRow; r++) {
      let score = 0;
      for (let c = 0; c <= maxCol; c++) {
        const raw = getCellValueResolved(r, c);
        if (raw == null) continue;
        if (formatDate(raw)) score++;
        if (
          typeof raw === "string" &&
          /\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4}/.test(raw)
        )
          score++;
      }
      if (score > bestDateScore) {
        bestDateScore = score;
        bestDateRow = r;
      }
    }
    if (bestDateRow === -1) bestDateRow = sec.headerRow - 1; 
    sec.dateRow = bestDateRow;

    let bestInOutRow = -1;
    let bestInOutScore = 0;
    for (
      let r = sec.dateRow;
      r <= Math.min(sec.headerRow + 2, sec.endRow);
      r++
    ) {
      let score = 0;
      for (let c = 0; c <= maxCol; c++) {
        const v = cellRaw(r, c);
        if (!v) continue;
        const s = String(v).toUpperCase().trim();
        if (s === "IN" || s === "OUT" || s === "I" || s === "O" || s.startsWith("IN") || s.startsWith("OUT")) score++;
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

   // NEW DATE COLUMN MAPPING (rock-solid)
const colToDate = new Map<number, string>();

// Step 1: find all DATE HEADER columns
const dateMarkers: { col: number; date: string }[] = [];
for (let c = 0; c <= maxCol; c++) {
  const raw = getCellValueResolved(sec.dateRow, c);
  const d = formatDate(raw);
  if (d) {
    dateMarkers.push({ col: c, date: d });
  }
}

if (dateMarkers.length > 0) {
  // Step 2: determine number of columns per punch-day group (IN / OUT / IN / OUT)
  let groupWidth = 4; // assume 4 punches/day
  const diffs: number[] = [];

  for (let i = 1; i < dateMarkers.length; i++) {
    const diff = dateMarkers[i].col - dateMarkers[i - 1].col;
    if (diff > 1) diffs.push(diff);
  }
  if (diffs.length > 0) {
    groupWidth = Math.min(...diffs);
    if (groupWidth < 1) groupWidth = 1;
  }

  // Step 3: strictly bind each date to a fixed set of columns
  for (let i = 0; i < dateMarkers.length; i++) {
    const startCol = dateMarkers[i].col;
    const stopCol =
      i + 1 < dateMarkers.length
        ? dateMarkers[i + 1].col
        : startCol + groupWidth;

    for (let c = startCol; c < stopCol; c++) {
      colToDate.set(c, dateMarkers[i].date);
    }
  }
}

// FINAL assignment
sec.colToDate = colToDate;
  }


  const employees: LunchInOutData[] = [];

  const detectEmpCols = (headerRow: number) => {
    let empCodeCol = -1;
    let empNameCol = -1;
    if (headerRow < 0) return { empCodeCol: -1, empNameCol: -1 };

    for (let c = 0; c <= Math.min(maxCol, 30); c++) {
      const v = cellRaw(headerRow, c);
      if (!v) continue;
      const s = String(v).toUpperCase();
      if (
        empCodeCol === -1 &&
        (s.includes("EMP CODE") || s === "CODE" || s.includes("ID") || s.includes("EMP. CODE"))
      ) {
        empCodeCol = c;
      }
      if (empNameCol === -1 && (s.includes("EMPLOYEE") || s.includes("NAME"))) {
        empNameCol = c;
      }
    }

    if (empNameCol === -1) {
      for (let c = 0; c <= Math.min(maxCol, 30); c++) {
        let nameCount = 0;
        for (let r = headerRow + 1; r <= Math.min(headerRow + 8, maxRow); r++) {
          const v = cellRaw(r, c);
          if (!v) continue;
          const s = String(v).trim();
          if (/^[A-Za-z .,'\-]{2,}$/i.test(s) && s.length > 1) nameCount++;
        }
        if (nameCount >= 2) {
          empNameCol = c;
          break;
        }
      }
    }

    if (empCodeCol === -1 && empNameCol !== -1) {
      for (
        let c = Math.max(0, empNameCol - 3);
        c <= Math.min(maxCol, empNameCol + 3);
        c++
      ) {
        if (c === empNameCol) continue;
        let numCount = 0;
        for (let r = headerRow + 1; r <= Math.min(headerRow + 8, maxRow); r++) {
          const v = cellRaw(r, c);
          if (!v) continue;
          const s = String(v).trim();
          if (/^\d{1,6}$/.test(s) || /^\d{1,6}\.\d+$/.test(s)) numCount++;
        }
        if (numCount >= 2) {
          empCodeCol = c;
          break;
        }
      }
    }

    if (empNameCol === -1 || empCodeCol === -1) {
      let found = 0;
      for (let c = 0; c <= Math.min(maxCol, 10); c++) {
        const v = cellRaw(headerRow + 1, c);
        if (v != null && String(v).trim() !== "") {
          if (found === 0 && empCodeCol === -1) empCodeCol = c;
          else if (found === 1 && empNameCol === -1) empNameCol = c;
          found++;
        }
        if (found >= 2) break;
      }
    }

    if (empCodeCol === -1) empCodeCol = 0;
    if (empNameCol === -1) empNameCol = Math.min(1, maxCol);
    return { empCodeCol, empNameCol };
  };

  for (const sec of sections) {
    if (sec.headerRow === -1) continue; 
    
    if (!sec.colToDate || sec.colToDate.size === 0) {
      continue;
    }

    const { empCodeCol, empNameCol } = detectEmpCols(sec.headerRow);

    const maxConsecutiveBlank = 18;
    let consecutiveBlank = 0;

    for (let r = sec.headerRow + 1; r <= sec.endRow; r++) {
      const empCodeVal = cellRaw(r, empCodeCol);
      const empNameVal = cellRaw(r, empNameCol);

      const rowHasTimeLike = (() => {
        for (let c = 0; c <= maxCol; c++) {
          const v = cellRaw(r, c);
          if (!v) continue;
          if (/\d{1,2}:\d{2}/.test(String(v))) return true;
          if (typeof v === "number" && v > 0 && v < 2) return true; 
        }
        return false;
      })();

      if (
        (!empCodeVal || String(empCodeVal).trim() === "") &&
        (!empNameVal || String(empNameVal).trim() === "") &&
        !rowHasTimeLike
      ) {
        consecutiveBlank++;
        if (consecutiveBlank >= maxConsecutiveBlank) break;
        continue;
      }
      consecutiveBlank = 0;

      const empCode = empCodeVal ? String(empCodeVal).trim() : "";
      const empName = empNameVal ? String(empNameVal).trim() : "";

      const bigUpper = (empCode + " " + empName).toUpperCase();
      if (bigUpper.includes("EMP") && bigUpper.includes("CODE")) continue;

      const dateGroups = new Map<
        string,
        Array<{ type: "In" | "Out"; time: string; col: number }>
      >();

      for (const [col, dateStr] of sec.colToDate.entries()) {
        const addr = XLSX.utils.encode_cell({ r, c: col });
        const cell = ws[addr];
        const rawVal = cell?.v ?? cell?.w ?? null;

        if (rawVal == null) continue;

        let timeStr = formatTime(rawVal);
        if (!timeStr && cell?.w) {
          timeStr = formatTime(cell.w);
        }

        if (!timeStr) continue;

        let typeGuess: "In" | "Out" = "In";
        let headerStr: string | null = null;

        for (let checkRow = sec.inOutRow; checkRow <= Math.min(sec.inOutRow + 2, sec.endRow); checkRow++) {
          const headerCell = cellRaw(checkRow, col);
          if (headerCell != null) {
            const hs = String(headerCell).trim().toUpperCase();
            if (hs === "IN" || hs === "OUT" || hs === "I" || hs === "O" || 
                hs.startsWith("IN") || hs.startsWith("OUT")) {
              headerStr = hs;
              break;
            }
          }
        }

        if (headerStr && (headerStr.includes("OUT") || headerStr.startsWith("O"))) {
          typeGuess = "Out";
        } else if (headerStr) {
          typeGuess = "In";
        } else {
          const allColsForDate: number[] = [];
          for (const [cc, ds] of sec.colToDate.entries()) {
            if (ds === dateStr) allColsForDate.push(cc);
          }
          allColsForDate.sort((a, b) => a - b);
          const idx = allColsForDate.indexOf(col);

          typeGuess = (idx % 2 === 0) ? "In" : "Out";
        }

        if (!dateGroups.has(dateStr)) dateGroups.set(dateStr, []);
        dateGroups.get(dateStr)!.push({ type: typeGuess, time: timeStr, col });
      }

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
      }
    }
  }

  return employees;

}