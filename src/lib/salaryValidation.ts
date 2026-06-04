// src/lib/salaryValidation.ts
// Salary page-wise total validation: compares Grand Total rows in Worker/Staff
// Excel pages against corresponding rows in the Month Wise Sheet.

import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColumnResult {
  field: string;
  /** Header column index in the worker sheet (0-based) */
  workerColIndex: number;
  /** Exact cell address in the worker sheet e.g. "B35" */
  workerCell: string;
  workerValue: number | string | null;
  /** Exact cell address in the month-wise sheet e.g. "C12" */
  monthWiseCell: string;
  monthWiseValue: number | string | null;
  match: boolean;
}

export interface PageResult {
  /** e.g. "Indiana Boys Worker - 01" */
  workerGroup: string;
  pageStartRow: number; // 1-based
  pageEndRow: number;   // 1-based
  grandTotalRow: number | null; // 1-based, null if not found
  /** Row in the Month Wise Sheet (1-based), null if not found */
  monthWiseRow: number | null;
  columns: ColumnResult[];
  /** True when ALL columns match */
  allMatch: boolean;
}

export interface MonthWiseColumnResult {
  field: string;
  colIndex: number;
  physicalSum: number;
  grandTotalRow: number | null; // 1-based
  grandTotalValue: number | string | null;
  grandTotalCell: string | null;
  match: boolean;
}

export interface MonthWiseValidationResult {
  columns: MonthWiseColumnResult[];
  allMatch: boolean;
}

export interface ValidationResult {
  sheetName: string;
  pages: PageResult[];
  monthWiseValidation?: MonthWiseValidationResult;
  /** Physical-sum check: detail rows in the Misc Excel vs its Grand Total row */
  miscSheetValidation?: MonthWiseValidationResult;
  error?: string;
}

/** Maps worker/misc page titles → Month Wise group labels */
const MONTH_WISE_GROUP_ALIASES: Record<string, string> = {
  "misc employee": "misc worker",
  "misc employee 2": "misc worker 02",
  "misc sheet 2": "misc worker 02",
};

// ─── Column mapping ────────────────────────────────────────────────────────────
// Maps the display label → keywords to search for in the column header (case-insensitive)
const COLUMNS_TO_VALIDATE: { label: string; keywords: string[] }[] = [
  { label: "WD Salary",       keywords: ["wd salary", "wd sal"] },
  { label: "Gross Salary",    keywords: ["salary1", "gross salary", "salary (s"] },
  { label: "PF 12%",          keywords: ["pf 12", "pf12"] },
  { label: "ESIC 0.75%",      keywords: ["esic"] },
  { label: "PT",              keywords: ["pt"] },
  { label: "Final Cheque",    keywords: ["final cheque", "final check"] },
  { label: "Cash Salary",     keywords: ["cash salary"] },
  { label: "Final Paid OT",   keywords: ["final paid ot", "finalpaidot"] },
  { label: "REAM.",           keywords: ["ream"] },
  { label: "Salary (S*T)",    keywords: ["s*t", "salary (s*t)", "salary s t"] },
  { label: "Ext. Adj",        keywords: ["extra adj", "ext adj", "ext. adj"] },
];

// Deduplicate: if a header matches multiple labels pick the most specific
// We track which col indices are already claimed.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function encodeCell(row: number, col: number): string {
  // row & col are 0-based
  return XLSX.utils.encode_cell({ r: row, c: col });
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function isSalaryHeader(cellStr: string): boolean {
  return cellStr.toUpperCase().includes("SALARY FOR THE MONTH");
}

/** Page labels that are only a sheet number (e.g. "01") — common in multi-company workbooks */
function isNumericPageLabel(name: string): boolean {
  const n = normalize(name);
  return /^page \d+$/.test(n) || /^\d{1,3}$/.test(n);
}

function getFileCategoryHint(fileName: string): "worker" | "staff" {
  return fileName.toLowerCase().includes("staff") ? "staff" : "worker";
}

function monthWiseRowMatchesFileHint(groupName: string, hint: "worker" | "staff"): boolean {
  const g = normalize(groupName);
  if (g.includes("misc")) return false;
  if (hint === "staff") return g.includes("staff") && !g.includes("worker");
  return g.includes("worker") && !g.includes("staff");
}

/** Prefer EMP. NAME / EMPLOYEE NAME — avoid mistaking EMP. ID for the name column */
function findNameColumnIndex(headers: unknown[]): number {
  const normHeaders = headers.map((h) => normalize(String(h ?? "")));
  const priority = [
    "employee name",
    "emp name",
    "emp. name",
    "worker group",
    "group name",
    "department",
    "category",
    "detail",
  ];
  for (const kw of priority) {
    const ci = normHeaders.findIndex((h) => h.includes(kw));
    if (ci >= 0) return ci;
  }
  const nameCol = normHeaders.findIndex((h) => h.includes("name") && !h.includes("id"));
  if (nameCol >= 0) return nameCol;
  return 0;
}

/** Extract a descriptive group name from the salary page header row */
function extractPageGroupName(headerRow: unknown[], pageIndex: number): string {
  const descriptive: string[] = [];
  for (let c = 0; c < headerRow.length; c++) {
    const v = String(headerRow[c] ?? "").trim();
    if (!v || isSalaryHeader(v)) continue;
    if (/^\d+(\.\d+)?$/.test(v)) continue;
    if (/^(page\s*)?\d{1,3}$/i.test(v)) continue;
    const norm = normalize(v);
    if (["nutraceutico", "indiana", "tulsi"].includes(norm)) continue;
    if (/worker|staff|employee|misc|office|apprentice|boys|girls/i.test(v)) return v;
    descriptive.push(v);
  }
  if (descriptive.length > 0) return descriptive[0];
  return `Page ${pageIndex + 1}`;
}

/** Find the column index matching the given keywords array. Returns -1 if not found.
 * For short keywords (no spaces), requires word-boundary match to avoid e.g. "pt" matching "dept".
 */
function findColIndex(headers: unknown[], keywords: string[]): number {
  // Build normalized headers once
  const normHeaders = headers.map((h) => normalize(String(h ?? "")));

  for (let c = 0; c < normHeaders.length; c++) {
    const h = normHeaders[c];
    for (const kw of keywords) {
      const normKw = normalize(kw);
      if (!normKw) continue;
      // If keyword has no spaces (single token), require word-boundary match
      if (!normKw.includes(" ")) {
        // Split header into tokens and check for exact token match
        const tokens = h.split(" ").filter(Boolean);
        if (tokens.includes(normKw)) return c;
      } else {
        // Multi-word keyword: substring match is fine
        if (h.includes(normKw)) return c;
      }
    }
  }
  return -1;
}

// ─── Worker sheet parsing ─────────────────────────────────────────────────────

interface RawPage {
  headerRow: number; // 0-based row index of "SALARY FOR THE MONTH..."
  workerGroup: string;
  columnHeaderRow: number; // 0-based
  headers: unknown[];
  grandTotalRowIndex: number | null; // 0-based
  endRowIndex: number; // 0-based, inclusive (before next page or EOF)
  rawData: unknown[][];
}

function parseWorkerSheet(ws: XLSX.WorkSheet): RawPage[] {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const totalRows = range.e.r + 1;
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    blankrows: true,
  }) as unknown[][];

  // ── 1. Find all page header rows ──────────────────────────────────────────
  const pageHeaderIndices: number[] = [];
  for (let r = 0; r < data.length; r++) {
    const row = data[r] as unknown[];
    if (row.length > 0 && row.some(cell => isSalaryHeader(String(cell ?? "")))) {
      pageHeaderIndices.push(r);
    }
  }

  if (pageHeaderIndices.length === 0) return [];

  const pages: RawPage[] = [];

  for (let p = 0; p < pageHeaderIndices.length; p++) {
    const headerRowIdx = pageHeaderIndices[p];
    const nextHeaderIdx =
      p + 1 < pageHeaderIndices.length
        ? pageHeaderIndices[p + 1]
        : data.length;

    const headerRow = data[headerRowIdx] as unknown[];
    const baseWorkerGroup = extractPageGroupName(headerRow, p);

    // Column header row: first row after header that has >= 5 non-empty cells
    let columnHeaderRowIdx = headerRowIdx + 1;
    for (let r = headerRowIdx + 1; r < nextHeaderIdx; r++) {
      const row = data[r] as unknown[];
      const nonEmpty = row.filter((c) => String(c ?? "").trim() !== "").length;
      if (nonEmpty >= 5) {
        columnHeaderRowIdx = r;
        break;
      }
    }
    const headers = data[columnHeaderRowIdx] as unknown[];

    // Find all "TOTAL" rows within this page section
    const totalRowIndices: number[] = [];
    for (let r = columnHeaderRowIdx + 1; r < nextHeaderIdx; r++) {
      const row = data[r] as unknown[];
      const rowStr = JSON.stringify(row).toUpperCase();
      if (
        rowStr.includes("GRAND TOTAL") ||
        rowStr.includes("TOTAL :-") ||
        rowStr.includes("TOTAL:-") ||
        rowStr.includes("TOTAL :") ||
        rowStr.includes("\"TOTAL\"")
      ) {
        totalRowIndices.push(r);
      }
    }

    if (totalRowIndices.length > 1) {
      // The Staff file format: A single page header, but multiple sub-groups
      // separated by TOTAL rows. We split this into multiple logical pages.
      let subPageStart = columnHeaderRowIdx + 1;
      for (let i = 0; i < totalRowIndices.length; i++) {
        const totalIdx = totalRowIndices[i];
        // Only generate "Office Staff - 0X" if the base group is "Office Staff"
        // or if we couldn't find a base name. Otherwise use "Base Name - 0X"
        const prefix = baseWorkerGroup.toLowerCase().includes("page") 
          ? "Office Staff" 
          : baseWorkerGroup;
        const subGroupName = `${prefix} - ${String(i + 1).padStart(2, "0")}`;

        pages.push({
          headerRow: headerRowIdx, // Use original header so it still knows it's a page
          workerGroup: subGroupName,
          columnHeaderRow: columnHeaderRowIdx,
          headers,
          grandTotalRowIndex: totalIdx,
          endRowIndex: totalIdx,
          rawData: data,
        });
        subPageStart = totalIdx + 1;
      }
    } else {
      // Standard Worker file format: one Grand Total at the end of the page
      let grandTotalRowIdx = totalRowIndices.length === 1 ? totalRowIndices[0] : null;

      // Fallback — the Grand Total is always the LAST non-empty row
      // just above the next "SALARY FOR THE MONTH" header
      if (grandTotalRowIdx === null) {
        for (let r = nextHeaderIdx - 1; r > columnHeaderRowIdx; r--) {
          const row = data[r] as unknown[];
          const nonEmpty = row.filter((c) => String(c ?? "").trim() !== "").length;
          if (nonEmpty >= 2) {
            grandTotalRowIdx = r;
            break;
          }
        }
      }

      pages.push({
        headerRow: headerRowIdx,
        workerGroup: baseWorkerGroup,
        columnHeaderRow: columnHeaderRowIdx,
        headers,
        grandTotalRowIndex: grandTotalRowIdx,
        endRowIndex: nextHeaderIdx - 1,
        rawData: data,
      });
    }
  }

  return pages;
}

// ─── Month Wise Sheet parsing ─────────────────────────────────────────────────

interface MonthWiseRow {
  rowIndex: number; // 0-based
  workerGroup: string;
  colMap: Record<string, { colIndex: number; value: number | string | null; cell: string }>;
}

function parseMonthWiseSheet(ws: XLSX.WorkSheet): {
  headerRowIndex: number;
  headers: unknown[];
  rows: MonthWiseRow[];
  grandTotalRowIndex: number | null;
  rawData: unknown[][];
} {
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    blankrows: true,
  }) as unknown[][];

  // Find header row (row with the most non-empty cells, within first 10 rows)
  let headerRowIndex = 0;
  let maxNonEmpty = 0;
  for (let r = 0; r < Math.min(data.length, 15); r++) {
    const row = data[r] as unknown[];
    const nonEmpty = row.filter((c) => String(c ?? "").trim() !== "").length;
    if (nonEmpty > maxNonEmpty) {
      maxNonEmpty = nonEmpty;
      headerRowIndex = r;
    }
  }
  const headers = data[headerRowIndex] as unknown[];

  const nameColIndex = findNameColumnIndex(headers);

  // Find Grand Total row in Month Wise sheet (look from bottom up)
  let grandTotalRowIndex: number | null = null;
  for (let r = data.length - 1; r > headerRowIndex; r--) {
    const row = data[r] as unknown[];
    const rowStr = JSON.stringify(row).toUpperCase();
    if (
      rowStr.includes("GRAND TOTAL") ||
      rowStr.includes("TOTAL :-") ||
      rowStr.includes("TOTAL:-") ||
      rowStr.includes("TOTAL :") ||
      rowStr.includes("\"TOTAL\"")
    ) {
      grandTotalRowIndex = r;
      break;
    }
  }
  // If not found explicitly, there might not be one. We'll leave it as null.

  const endRowForData = grandTotalRowIndex !== null ? grandTotalRowIndex : data.length;

  const rows: MonthWiseRow[] = [];
  for (let r = headerRowIndex + 1; r < endRowForData; r++) {
    const row = data[r] as unknown[];
    const groupName = String(row[nameColIndex] ?? "").trim();
    if (!groupName) continue;

    const colMap: MonthWiseRow["colMap"] = {};
    for (const { label, keywords } of COLUMNS_TO_VALIDATE) {
      const ci = findColIndex(headers, keywords);
      if (ci >= 0) {
        colMap[label] = {
          colIndex: ci,
          value: (toNum(row[ci]) ?? String(row[ci] ?? "").trim()) || null,
          cell: encodeCell(r, ci),
        };
      }
    }

    rows.push({ rowIndex: r, workerGroup: groupName, colMap });
  }

  return { headerRowIndex, headers, rows, grandTotalRowIndex, rawData: data };
}

// ─── Misc sheet parsing (Misc. Employee 2 — separate Excel file) ─────────────

interface ParsedMiscSheet {
  workerGroup: string;
  headerRowIndex: number;
  headers: unknown[];
  grandTotalRowIndex: number | null;
  firstDetailRowIndex: number;
  lastDetailRowIndex: number;
  rawData: unknown[][];
}

function isMiscSecondLabel(name: string): boolean {
  const n = normalize(name);
  if (!n.includes("misc")) return false;
  return /\b02\b/.test(n) || n.endsWith(" 2");
}

function parseMiscSheet(ws: XLSX.WorkSheet): ParsedMiscSheet | null {
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    blankrows: true,
  }) as unknown[][];

  if (data.length < 3) return null;

  let headerRowIndex = 0;
  let maxNonEmpty = 0;
  for (let r = 0; r < Math.min(data.length, 10); r++) {
    const row = data[r] as unknown[];
    const nonEmpty = row.filter((c) => String(c ?? "").trim() !== "").length;
    if (nonEmpty > maxNonEmpty) {
      maxNonEmpty = nonEmpty;
      headerRowIndex = r;
    }
  }
  const headers = data[headerRowIndex] as unknown[];

  let nameColIndex = 3;
  for (let c = 0; c < headers.length; c++) {
    const h = normalize(String(headers[c] ?? ""));
    if (h.includes("employee name") || h === "emp name" || h.includes("emp name")) {
      nameColIndex = c;
      break;
    }
  }

  let grandTotalRowIndex: number | null = null;
  for (let r = data.length - 1; r > headerRowIndex; r--) {
    const row = data[r] as unknown[];
    const rowStr = JSON.stringify(row).toUpperCase();
    if (
      rowStr.includes("GRAND TOTAL") ||
      rowStr.includes("TOTAL :-") ||
      rowStr.includes("TOTAL:-") ||
      rowStr.includes("TOTAL :")
    ) {
      grandTotalRowIndex = r;
      break;
    }
  }

  if (grandTotalRowIndex === null) {
    for (let r = data.length - 1; r > headerRowIndex; r--) {
      const row = data[r] as unknown[];
      const name = String(row[nameColIndex] ?? "").trim();
      const grossCol = findColIndex(headers, ["salary1", "gross salary"]);
      const gross = grossCol >= 0 ? toNum(row[grossCol]) : null;
      if (!name && gross !== null && gross > 0) {
        grandTotalRowIndex = r;
        break;
      }
    }
  }

  if (grandTotalRowIndex === null) return null;

  let firstDetail = headerRowIndex + 1;
  let lastDetail = grandTotalRowIndex - 1;
  for (let r = headerRowIndex + 1; r < grandTotalRowIndex; r++) {
    const row = data[r] as unknown[];
    const name = String(row[nameColIndex] ?? "").trim();
    if (name && !normalize(name).includes("employee name")) {
      firstDetail = r;
      break;
    }
  }
  for (let r = grandTotalRowIndex - 1; r > headerRowIndex; r--) {
    const row = data[r] as unknown[];
    const name = String(row[nameColIndex] ?? "").trim();
    if (name && !normalize(name).includes("employee name")) {
      lastDetail = r;
      break;
    }
  }

  return {
    workerGroup: "Misc. Employee 2",
    headerRowIndex,
    headers,
    grandTotalRowIndex,
    firstDetailRowIndex: firstDetail,
    lastDetailRowIndex: lastDetail,
    rawData: data,
  };
}

function buildPhysicalSumValidation(
  headers: unknown[],
  rawData: unknown[][],
  firstDetailRow: number,
  lastDetailRow: number,
  grandTotalRowIndex: number | null
): MonthWiseValidationResult {
  const mwCols: MonthWiseColumnResult[] = [];
  const usedLabels = new Set<string>();
  const mwAssignedCols = new Set<number>();
  const mwColAssignments: Array<{ label: string; colIndex: number }> = [];

  for (const { label, keywords } of COLUMNS_TO_VALIDATE) {
    if (usedLabels.has(label)) continue;
    const ci = findColIndex(headers, keywords);
    if (ci >= 0 && !mwAssignedCols.has(ci)) {
      mwColAssignments.push({ label, colIndex: ci });
      mwAssignedCols.add(ci);
      usedLabels.add(label);
    } else if (ci >= 0) {
      mwColAssignments.push({ label, colIndex: ci });
      usedLabels.add(label);
    }
  }

  let mwAllMatch = true;
  for (const { label, colIndex } of mwColAssignments) {
    let sum = 0;
    for (let r = firstDetailRow; r <= lastDetailRow; r++) {
      const row = rawData[r] as unknown[];
      const v = row[colIndex];
      const num = typeof v === "number" ? v : toNum(v);
      if (num !== null) sum += num;
    }
    const physicalSum = Math.round(sum * 100) / 100;

    let gtVal: number | string | null = null;
    let gtCell: string | null = null;
    if (grandTotalRowIndex !== null && colIndex >= 0) {
      const gtRow = rawData[grandTotalRowIndex] as unknown[];
      gtVal = (toNum(gtRow[colIndex]) ?? String(gtRow[colIndex] ?? "").trim()) || null;
      gtCell = encodeCell(grandTotalRowIndex, colIndex);
    }

    const coerce = (v: number | string | null): number => {
      if (v === null || v === undefined || v === "") return 0;
      if (typeof v === "string") {
        const n = toNum(v);
        return n !== null ? n : 0;
      }
      return v;
    };

    const roundedGt = Math.round(coerce(gtVal) * 100) / 100;
    const match = physicalSum === roundedGt;
    if (!match) mwAllMatch = false;

    mwCols.push({
      field: label,
      colIndex,
      physicalSum,
      grandTotalRow: grandTotalRowIndex !== null ? grandTotalRowIndex + 1 : null,
      grandTotalValue: gtVal,
      grandTotalCell: gtCell,
      match,
    });
  }

  return { columns: mwCols, allMatch: mwCols.length > 0 && mwAllMatch };
}

// ─── Fuzzy group name matching ────────────────────────────────────────────────

interface MatchWorkerGroupOptions {
  fileHint?: "worker" | "staff";
  /** Index among numbered pages in the same file (01, 02, …) */
  numericPageIndex?: number;
}

function matchWorkerGroup(
  name: string,
  monthWiseRows: MonthWiseRow[],
  usedRowIndices: Set<number>,
  options?: MatchWorkerGroupOptions
): MonthWiseRow | null {
  const normName = normalize(name);
  const wantsSecond = isMiscSecondLabel(name);
  /** Helper: skip already-used rows */
  const available = (r: MonthWiseRow) => !usedRowIndices.has(r.rowIndex);
  const miscRowOk = (r: MonthWiseRow) => {
    const g = normalize(r.workerGroup);
    const rowIsSecond = isMiscSecondLabel(g);
    if (wantsSecond) return rowIsSecond;
    if (g.includes("misc") && rowIsSecond) return false;
    return true;
  };

  const aliasTarget = MONTH_WISE_GROUP_ALIASES[normName];
  if (aliasTarget) {
    const match = monthWiseRows.find(
      (r) => available(r) && miscRowOk(r) && normalize(r.workerGroup) === aliasTarget
    );
    if (match) return match;
  }

  // Exact match
  let match = monthWiseRows.find(
    (r) => available(r) && miscRowOk(r) && normalize(r.workerGroup) === normName
  );
  if (match) return match;

  // Partial: one contains the other
  match = monthWiseRows.find(
    (r) =>
      available(r) &&
      miscRowOk(r) &&
      (normalize(r.workerGroup).includes(normName) ||
        normName.includes(normalize(r.workerGroup)))
  );
  if (match) return match;

  // Token overlap
  const nameTokens = normName.split(" ").filter(Boolean);
  let bestScore = 0;
  let bestMatch: MonthWiseRow | null = null;
  for (const r of monthWiseRows) {
    if (!available(r) || !miscRowOk(r)) continue;
    const rNorm = normalize(r.workerGroup);
    const rTokens = rNorm.split(" ").filter(Boolean);
    const shared = nameTokens.filter((t) => rTokens.includes(t)).length;
    const score = shared / Math.max(nameTokens.length, rTokens.length);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = r;
    }
  }
  if (bestScore >= 0.5 && bestMatch) return bestMatch;

  // Numbered pages (e.g. "01") + Worker/Staff file → match NUTRA WORKER / NUTRA STAFF rows
  if (options?.fileHint && isNumericPageLabel(name)) {
    const candidates = monthWiseRows
      .filter((r) => available(r) && miscRowOk(r))
      .filter((r) => monthWiseRowMatchesFileHint(r.workerGroup, options.fileHint!))
      .sort((a, b) => a.rowIndex - b.rowIndex);
    const idx = options.numericPageIndex ?? 0;
    if (candidates[idx]) return candidates[idx];
  }

  return null;
}

// ─── Main validation entry point ──────────────────────────────────────────────

/** Process a single sheet's pages and push results into `pages`.
 *  Mutates `usedMwRowIndices` and `pages` in place. */
async function processWorkerFile(
  workerFile: File,
  monthWiseParsed: ReturnType<typeof parseMonthWiseSheet>,
  pages: PageResult[],
  usedMwRowIndices: Set<number>
): Promise<string> {
  const workerBuf = await workerFile.arrayBuffer();
  const workerWb = XLSX.read(workerBuf, { type: "array" });
  const workerSheetName = workerWb.SheetNames[0];
  const workerWs = workerWb.Sheets[workerSheetName];
  const rawPages = parseWorkerSheet(workerWs);
  const fileHint = getFileCategoryHint(workerFile.name);
  let numericPageIndex = 0;

  for (const page of rawPages) {
    const { workerGroup, headerRow, endRowIndex, grandTotalRowIndex, headers, rawData } = page;
    const matchOptions: MatchWorkerGroupOptions = {
      fileHint,
      numericPageIndex: isNumericPageLabel(workerGroup) ? numericPageIndex : undefined,
    };

    // Find matching Month Wise row — skip rows already claimed by earlier pages
    let mwRow = matchWorkerGroup(
      workerGroup,
      monthWiseParsed.rows,
      usedMwRowIndices,
      matchOptions
    );
    if (isNumericPageLabel(workerGroup)) numericPageIndex++;

    // Sequential fallback: if fuzzy match failed AND a previous page with the
    // same worker group name already matched a Month Wise row, try the NEXT
    // consecutive available Month Wise row in the sheet.
    if (!mwRow) {
      const previousMatchedPage = [...pages]
        .reverse()
        .find(
          (p) =>
            normalize(p.workerGroup) === normalize(workerGroup) &&
            p.monthWiseRow !== null
        );
      if (previousMatchedPage && previousMatchedPage.monthWiseRow !== null) {
        const prevRowIndex = previousMatchedPage.monthWiseRow - 1;
        const nextAvailable = monthWiseParsed.rows.find(
          (r) => r.rowIndex > prevRowIndex && !usedMwRowIndices.has(r.rowIndex)
        );
        if (nextAvailable) mwRow = nextAvailable;
      }
    }

    if (mwRow) usedMwRowIndices.add(mwRow.rowIndex);

    // Build column-result list
    const columns: ColumnResult[] = [];
    const usedLabels = new Set<string>();
    const colAssignments: Array<{ label: string; colIndex: number }> = [];
    const assignedCols = new Set<number>();

    // ── OFFICE STAFF SPECIFIC OVERRIDES (Staff Tulsi.xlsx) ──
    // WD Salary → SALARY1 (O/14), Gross Salary → GROSS SALARY (R/17), Final Paid OT → NET OT (AD/29)
    const isOfficeStaff = workerGroup.toUpperCase().includes("OFFICE STAFF");
    if (isOfficeStaff) {
      colAssignments.push({ label: "WD Salary", colIndex: 14 }); // O — matches Month Wise WD SALARY
      assignedCols.add(14);
      usedLabels.add("WD Salary");

      colAssignments.push({ label: "Gross Salary", colIndex: 17 }); // R
      assignedCols.add(17);
      usedLabels.add("Gross Salary");

      colAssignments.push({ label: "Final Paid OT", colIndex: 29 }); // AD
      assignedCols.add(29);
      usedLabels.add("Final Paid OT");
    } else if (fileHint === "staff" && findColIndex(headers, ["gross salary"]) >= 0) {
      // Staff Tulsi layout (e.g. NUTRA STAFF): WD → SALARY1, Gross → GROSS SALARY
      colAssignments.push({ label: "WD Salary", colIndex: 14 });
      assignedCols.add(14);
      usedLabels.add("WD Salary");

      colAssignments.push({ label: "Gross Salary", colIndex: 17 });
      assignedCols.add(17);
      usedLabels.add("Gross Salary");

      let finalOtCol = findColIndex(headers, ["net ot"]);
      if (finalOtCol < 0) finalOtCol = findColIndex(headers, ["p ot", "final paid ot"]);
      if (finalOtCol >= 0) {
        colAssignments.push({ label: "Final Paid OT", colIndex: finalOtCol });
        assignedCols.add(finalOtCol);
        usedLabels.add("Final Paid OT");
      }
    }

    for (const { label, keywords } of COLUMNS_TO_VALIDATE) {
      if (usedLabels.has(label)) continue;
      const ci = findColIndex(headers, keywords);
      if (ci >= 0 && !assignedCols.has(ci)) {
        colAssignments.push({ label, colIndex: ci });
        assignedCols.add(ci);
        usedLabels.add(label);
      } else if (ci >= 0) {
        colAssignments.push({ label, colIndex: ci });
        usedLabels.add(label);
      }
    }

    for (const { label, colIndex } of colAssignments) {
      let workerVal: number | string | null = null;
      let workerCell = "";
      if (grandTotalRowIndex !== null && colIndex >= 0) {
        const gtRow = rawData[grandTotalRowIndex] as unknown[];
        workerVal = (toNum(gtRow[colIndex]) ?? String(gtRow[colIndex] ?? "").trim()) || null;
        workerCell = encodeCell(grandTotalRowIndex, colIndex);
      }

      let mwVal: number | string | null = null;
      let mwCell = "";
      if (mwRow) {
        const mwColData = mwRow.colMap[label];
        if (mwColData) {
          mwVal = mwColData.value;
          mwCell = mwColData.cell;
        }
      }

      const coerce = (v: number | string | null): number | string => {
        if (v === null || v === undefined || v === "") return 0;
        return v;
      };
      const roundedWorker =
        typeof workerVal === "number"
          ? Math.round(workerVal * 100) / 100
          : coerce(workerVal);
      const roundedMw =
        typeof mwVal === "number"
          ? Math.round(mwVal * 100) / 100
          : coerce(mwVal);

      const match = roundedWorker === roundedMw;

      columns.push({
        field: label,
        workerColIndex: colIndex,
        workerCell,
        workerValue: workerVal,
        monthWiseCell: mwCell,
        monthWiseValue: mwVal,
        match,
      });
    }

    const displayGroup =
      mwRow && (isNumericPageLabel(workerGroup) || workerGroup.toLowerCase().startsWith("page "))
        ? mwRow.workerGroup
        : workerGroup;

    pages.push({
      workerGroup: displayGroup,
      pageStartRow: headerRow + 1,
      pageEndRow: endRowIndex + 1,
      grandTotalRow: grandTotalRowIndex !== null ? grandTotalRowIndex + 1 : null,
      monthWiseRow: mwRow ? mwRow.rowIndex + 1 : null,
      columns,
      allMatch: columns.length > 0 && columns.every((c) => c.match),
    });
  }

  return workerSheetName;
}

/** Misc. Employee 2 lives in a separate Misc Excel — compare its Grand Total to Month Wise. */
async function processMiscFile(
  miscFile: File,
  monthWiseParsed: ReturnType<typeof parseMonthWiseSheet>,
  pages: PageResult[],
  usedMwRowIndices: Set<number>
): Promise<{ sheetName: string; physicalSum: MonthWiseValidationResult } | null> {
  const miscBuf = await miscFile.arrayBuffer();
  const miscWb = XLSX.read(miscBuf, { type: "array" });
  const miscSheetName = miscWb.SheetNames[0];
  const miscWs = miscWb.Sheets[miscSheetName];
  const parsed = parseMiscSheet(miscWs);
  if (!parsed || parsed.grandTotalRowIndex === null) return null;

  const { workerGroup, headers, grandTotalRowIndex, rawData, headerRowIndex, firstDetailRowIndex, lastDetailRowIndex } =
    parsed;

  let mwRow = matchWorkerGroup(workerGroup, monthWiseParsed.rows, usedMwRowIndices);
  if (!mwRow) {
    const miscRows = monthWiseParsed.rows.filter(
      (r) => normalize(r.workerGroup).includes("misc") && isMiscSecondLabel(r.workerGroup)
    );
    mwRow = miscRows.find((r) => !usedMwRowIndices.has(r.rowIndex)) ?? null;
  }
  if (mwRow) usedMwRowIndices.add(mwRow.rowIndex);

  const columns: ColumnResult[] = [];
  const usedLabels = new Set<string>();
  const colAssignments: Array<{ label: string; colIndex: number }> = [];
  const assignedCols = new Set<number>();

  for (const { label, keywords } of COLUMNS_TO_VALIDATE) {
    if (usedLabels.has(label)) continue;
    const ci = findColIndex(headers, keywords);
    if (ci >= 0 && !assignedCols.has(ci)) {
      colAssignments.push({ label, colIndex: ci });
      assignedCols.add(ci);
      usedLabels.add(label);
    } else if (ci >= 0) {
      colAssignments.push({ label, colIndex: ci });
      usedLabels.add(label);
    }
  }

  for (const { label, colIndex } of colAssignments) {
    let workerVal: number | string | null = null;
    let workerCell = "";
    const gtRow = rawData[grandTotalRowIndex] as unknown[];
    workerVal = (toNum(gtRow[colIndex]) ?? String(gtRow[colIndex] ?? "").trim()) || null;
    workerCell = encodeCell(grandTotalRowIndex, colIndex);

    let mwVal: number | string | null = null;
    let mwCell = "";
    if (mwRow) {
      const mwColData = mwRow.colMap[label];
      if (mwColData) {
        mwVal = mwColData.value;
        mwCell = mwColData.cell;
      }
    }

    const coerce = (v: number | string | null): number | string => {
      if (v === null || v === undefined || v === "") return 0;
      return v;
    };
    const roundedWorker =
      typeof workerVal === "number" ? Math.round(workerVal * 100) / 100 : coerce(workerVal);
    const roundedMw =
      typeof mwVal === "number" ? Math.round(mwVal * 100) / 100 : coerce(mwVal);

    columns.push({
      field: label,
      workerColIndex: colIndex,
      workerCell,
      workerValue: workerVal,
      monthWiseCell: mwCell,
      monthWiseValue: mwVal,
      match: roundedWorker === roundedMw,
    });
  }

  pages.push({
    workerGroup,
    pageStartRow: firstDetailRowIndex + 1,
    pageEndRow: lastDetailRowIndex + 1,
    grandTotalRow: grandTotalRowIndex + 1,
    monthWiseRow: mwRow ? mwRow.rowIndex + 1 : null,
    columns,
    allMatch: columns.length > 0 && columns.every((c) => c.match),
  });

  const physicalSum = buildPhysicalSumValidation(
    headers,
    rawData,
    firstDetailRowIndex,
    lastDetailRowIndex,
    grandTotalRowIndex
  );

  return { sheetName: miscSheetName, physicalSum };
}

export async function validateSalary(
  workerFiles: File[],
  monthWiseFile: File,
  miscFile?: File | null
): Promise<ValidationResult> {
  const monthWiseBuf = await monthWiseFile.arrayBuffer();
  const monthWiseWb = XLSX.read(monthWiseBuf, { type: "array" });
  const monthWiseSheetName = monthWiseWb.SheetNames[0];
  const monthWiseWs = monthWiseWb.Sheets[monthWiseSheetName];
  const monthWiseParsed = parseMonthWiseSheet(monthWiseWs);

  const pages: PageResult[] = [];
  const usedMwRowIndices = new Set<number>();

  // Process all worker/staff files sequentially, sharing the same row-tracking set
  for (const file of workerFiles) {
    await processWorkerFile(file, monthWiseParsed, pages, usedMwRowIndices);
  }

  let miscSheetValidation: MonthWiseValidationResult | undefined;
  if (miscFile) {
    const miscResult = await processMiscFile(
      miscFile,
      monthWiseParsed,
      pages,
      usedMwRowIndices
    );
    if (miscResult) miscSheetValidation = miscResult.physicalSum;
  }

  // ── Month Wise Physical Sums Validation ──
  const mwCols: MonthWiseColumnResult[] = [];
  const mwData = monthWiseParsed.rawData;
  const gtRowIdx = monthWiseParsed.grandTotalRowIndex;
  
  const usedLabels = new Set<string>();
  const mwAssignedCols = new Set<number>();
  const mwColAssignments: Array<{ label: string; colIndex: number }> = [];
  for (const { label, keywords } of COLUMNS_TO_VALIDATE) {
    if (usedLabels.has(label)) continue;
    const ci = findColIndex(monthWiseParsed.headers, keywords);
    if (ci >= 0 && !mwAssignedCols.has(ci)) {
      mwColAssignments.push({ label, colIndex: ci });
      mwAssignedCols.add(ci);
      usedLabels.add(label);
    } else if (ci >= 0) {
      mwColAssignments.push({ label, colIndex: ci });
      usedLabels.add(label);
    }
  }

  let mwAllMatch = true;
  for (const { label, colIndex } of mwColAssignments) {
    let sum = 0;
    // Tally up the physical sum from all recognized group rows
    for (const row of monthWiseParsed.rows) {
      const v = row.colMap[label]?.value;
      if (typeof v === "number") {
        sum += v;
      } else if (typeof v === "string") {
        const num = toNum(v);
        if (num !== null) sum += num;
      }
    }
    const physicalSum = Math.round(sum * 100) / 100;

    let gtVal: number | string | null = null;
    let gtCell: string | null = null;
    if (gtRowIdx !== null && colIndex >= 0) {
      const gtRow = mwData[gtRowIdx] as unknown[];
      gtVal = (toNum(gtRow[colIndex]) ?? String(gtRow[colIndex] ?? "").trim()) || null;
      gtCell = encodeCell(gtRowIdx, colIndex);
    }

    const coerce = (v: number | string | null): number => {
      if (v === null || v === undefined || v === "") return 0;
      if (typeof v === "string") {
        const n = toNum(v);
        return n !== null ? n : 0;
      }
      return v;
    };

    const roundedGt = Math.round(coerce(gtVal) * 100) / 100;
    const match = physicalSum === roundedGt;
    if (!match) mwAllMatch = false;

    mwCols.push({
      field: label,
      colIndex,
      physicalSum,
      grandTotalRow: gtRowIdx !== null ? gtRowIdx + 1 : null,
      grandTotalValue: gtVal,
      grandTotalCell: gtCell,
      match,
    });
  }

  return {
    sheetName: workerFiles.map((f) => f.name).join(" + "),
    pages,
    monthWiseValidation: {
      columns: mwCols,
      allMatch: mwCols.length > 0 && mwAllMatch,
    },
    miscSheetValidation,
  };
}
