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

export interface ValidationResult {
  sheetName: string;
  pages: PageResult[];
  error?: string;
}

// ─── Column mapping ────────────────────────────────────────────────────────────
// Maps the display label → keywords to search for in the column header (case-insensitive)
const COLUMNS_TO_VALIDATE: { label: string; keywords: string[] }[] = [
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
    if (row.length > 0 && isSalaryHeader(String(row[0] ?? ""))) {
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

    // Worker group name: scan the header row for a non-empty cell after col 10
    const headerRow = data[headerRowIdx] as unknown[];
    let workerGroup = "";
    for (let c = 10; c < headerRow.length; c++) {
      const v = String(headerRow[c] ?? "").trim();
      if (v && !isSalaryHeader(v)) {
        workerGroup = v;
        break;
      }
    }
    if (!workerGroup) workerGroup = `Page ${p + 1}`;

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

    // Grand total row detection (two passes):
    // Pass 1 — look for explicit "TOTAL" / "GRAND TOTAL" text row
    let grandTotalRowIdx: number | null = null;
    for (let r = nextHeaderIdx - 1; r > columnHeaderRowIdx; r--) {
      const row = data[r] as unknown[];
      const rowStr = JSON.stringify(row).toUpperCase();
      if (
        rowStr.includes("GRAND TOTAL") ||
        rowStr.includes("TOTAL :-") ||
        rowStr.includes("TOTAL:-") ||
        rowStr.includes("TOTAL :") ||
        rowStr.includes("\"TOTAL\"")
      ) {
        grandTotalRowIdx = r;
        break;
      }
    }
    // Pass 2 fallback — the Grand Total is always the LAST non-empty row
    // just above the next "SALARY FOR THE MONTH" header (user-confirmed rule).
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
      workerGroup,
      columnHeaderRow: columnHeaderRowIdx,
      headers,
      grandTotalRowIndex: grandTotalRowIdx,
      endRowIndex: nextHeaderIdx - 1,
      rawData: data,
    });
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

  // Find name/group column (first col with worker-group-like content)
  let nameColIndex = 0;
  for (let c = 0; c < headers.length; c++) {
    const h = normalize(String(headers[c] ?? ""));
    if (h.includes("name") || h.includes("worker") || h.includes("group") || h.includes("department") || h.includes("category") || h.includes("detail")) {
      nameColIndex = c;
      break;
    }
  }

  const rows: MonthWiseRow[] = [];
  for (let r = headerRowIndex + 1; r < data.length; r++) {
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

  return { headerRowIndex, headers, rows };
}

// ─── Fuzzy group name matching ────────────────────────────────────────────────

function matchWorkerGroup(
  name: string,
  monthWiseRows: MonthWiseRow[],
  usedRowIndices: Set<number>
): MonthWiseRow | null {
  const normName = normalize(name);
  /** Helper: skip already-used rows */
  const available = (r: MonthWiseRow) => !usedRowIndices.has(r.rowIndex);

  // Exact match
  let match = monthWiseRows.find((r) => available(r) && normalize(r.workerGroup) === normName);
  if (match) return match;

  // Partial: one contains the other
  match = monthWiseRows.find(
    (r) =>
      available(r) &&
      (normalize(r.workerGroup).includes(normName) ||
        normName.includes(normalize(r.workerGroup)))
  );
  if (match) return match;

  // Token overlap
  const nameTokens = normName.split(" ").filter(Boolean);
  let bestScore = 0;
  let bestMatch: MonthWiseRow | null = null;
  for (const r of monthWiseRows) {
    if (!available(r)) continue;
    const rNorm = normalize(r.workerGroup);
    const rTokens = rNorm.split(" ").filter(Boolean);
    const shared = nameTokens.filter((t) => rTokens.includes(t)).length;
    const score = shared / Math.max(nameTokens.length, rTokens.length);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = r;
    }
  }
  return bestScore >= 0.5 ? bestMatch : null;
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

  for (const page of rawPages) {
    const { workerGroup, headerRow, endRowIndex, grandTotalRowIndex, headers, rawData } = page;

    // Build column-result list
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

    // Find matching Month Wise row — skip rows already claimed by earlier pages
    let mwRow = matchWorkerGroup(workerGroup, monthWiseParsed.rows, usedMwRowIndices);

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

    pages.push({
      workerGroup,
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

export async function validateSalary(
  workerFiles: File[],
  monthWiseFile: File
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

  return {
    sheetName: workerFiles.map((f) => f.name).join(" + "),
    pages,
  };
}
