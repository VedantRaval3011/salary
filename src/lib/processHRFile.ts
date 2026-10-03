import * as XLSX from "xlsx";

export interface HRData {
  empCode: string;
  empName: string;
  presentDays: number;
  day?: number;
  OT?: number;
  Late?: number; // ADD LATE FIELD
  doj?: string; // Date of joining as written in the DOJ column
  /** Day of month the employee joined, set only when DOJ falls inside this salary month. */
  joinDay?: number;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Reads "SALARY FOR THE MONTH OF SEPTEMBER-2026" / "SEP-2026" from the title rows. */
const findSalaryMonth = (data: any[][]): { month: number; year: number } | null => {
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const text = (data[i] || []).filter(Boolean).join(" ").toUpperCase();
    const m = text.match(/MONTH OF\s+([A-Z]+)[\s\-.,']*(\d{2,4})/);
    if (m) {
      const month = MONTHS.indexOf(m[1].slice(0, 3)) + 1;
      let year = Number(m[2]);
      if (year < 100) year += 2000;
      if (month > 0) return { month, year };
    }
  }
  return null;
};

/** Parses DOJ cells: Date objects, Excel serials, or text like "06.09.26" / "6/9/2026". */
const parseDOJ = (value: any): { day: number; month: number; year: number } | null => {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return { day: value.getDate(), month: value.getMonth() + 1, year: value.getFullYear() };
  }
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    return d ? { day: d.d, month: d.m, year: d.y } : null;
  }
  const m = String(value).trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return { day: Number(m[1]), month: Number(m[2]), year };
};

/**
 * Finds the header row index by searching for key column names.
 */
const findHeaderRow = (data: any[][], keyCols: string[]): number => {
  for (let i = 0; i < 20; i++) {
    const row = data[i];
    if (!row || !Array.isArray(row)) continue;

    const rowString = row.join(" ").toUpperCase();
    if (keyCols.some((key) => rowString.includes(key.toUpperCase()))) {
      return i;
    }
  }
  return -1;
};

/**
 * Creates a map of column names to their index.
 */
const getColumnMap = (header: string[]): { [key: string]: number } => {
  const map: { [key: string]: number } = {};
  header.forEach((val, index) => {
    if (val) {
      const trimmedVal = String(val).trim();
      map[trimmedVal] = index;
      map[trimmedVal.toUpperCase()] = index;
    }
  });
  return map;
};

// --- Main Processor Function ---
export async function processHRFile(
  file: File,
  type: "staff" | "worker"
): Promise<HRData[]> {
  console.log(`Processing HR file (${type}): ${file.name}`);
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
  });

  // If the sheet is completely empty (e.g. Worker Tulsi for NRTM), return early
  const nonEmptyRows = data.filter(
    (row) => row && row.some((v: any) => v !== null && v !== undefined && v !== "")
  );
  if (nonEmptyRows.length === 0) {
    console.log(`ℹ️ HR file "${file.name}" is empty — returning no records.`);
    return [];
  }

  const searchTerms = [
    "Emp. Code",
    "EMP CODE",
    "Emp Code",
    "Employee Code",
    "Employee Name",
    "NAME",
    "Sr. No.",
    "EMP. ID",
  ];
  const headerRowIndex = findHeaderRow(data, searchTerms);

  if (headerRowIndex === -1) {
    throw new Error(
      `Could not find header row in HR file. (Searched for: ${searchTerms.join(", ")})`
    );
  }

  let header: string[] = data[headerRowIndex].map(String);
  let colMap = getColumnMap(header);

  const salaryMonth = findSalaryMonth(data);
  let dojCol: number | undefined = colMap["DOJ"];

  let codeCol =
    colMap["Emp. Code"] ??
    colMap["EMP CODE"] ??
    colMap["Emp Code"] ??
    colMap["Employee Code"] ??
    colMap["EMP. ID"];

  let nameCol =
    colMap["Employee Name"] ??
    colMap["NAME"] ??
    colMap["Emp. Name"] ??
    colMap["EMPNAME"] ??
    colMap["EMPLOYEE NAME"];

  let presentDaysCol: number | undefined =
    type === "staff"
      ? colMap["DAY"]
      : colMap["ADJ DAYS"] ??
        colMap["SALARY(S*T)"] ??
        colMap["SALARY"] ??
        colMap["ACT.DAY"];

  // Capture DAY column separately (needed for fallback)
  let dayCol: number | undefined = colMap["DAY"] ?? colMap["Day"] ?? colMap["day"];

  let otCol: number | undefined = colMap["OT"] ?? colMap["ot"];

  // ADD LATE COLUMN DETECTION
  let lateCol: number | undefined =
    type === "staff"
      ? colMap["Final Late"] ?? colMap["FINAL LATE"] ?? colMap["final late"]
      : colMap["LATE"] ?? colMap["Late"] ?? colMap["late"];

  if (codeCol === undefined || nameCol === undefined) {
    throw new Error(
      `Could not find 'Emp. Code' or 'Name' columns in the header row: [${header.join(", ")}]`
    );
  }

  console.log(`📊 Found present days column: ${presentDaysCol}`);
  if (otCol !== undefined) {
    console.log(`📊 Found OT column at index: ${otCol}`);
  } else {
    console.warn(`⚠️ Could not find OT column in header: [${header.join(", ")}]`);
  }

  // ADD LATE COLUMN LOGGING
  if (lateCol !== undefined) {
    console.log(`📊 Found Late column at index: ${lateCol}`);
  } else {
    console.warn(`⚠️ Could not find Late column in header: [${header.join(", ")}]`);
  }

  const employees: HRData[] = [];

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.every((v: any) => v === null || v === undefined || v === "")) {
      continue;
    }

    // 🔍 Detect new section header (like second header at row 217)
    const rowString = row.join(" ").toUpperCase();
    if (
      rowString.includes("EMP") &&
      rowString.includes("CODE") &&
      rowString.includes("NAME")
    ) {
      console.log(`🔄 Detected new header at row ${i}`);
      header = row.map(String);
      colMap = getColumnMap(header);

      codeCol =
        colMap["Emp. Code"] ??
        colMap["EMP CODE"] ??
        colMap["Emp Code"] ??
        colMap["Employee Code"] ??
        colMap["EMP. ID"];

      nameCol =
        colMap["Employee Name"] ??
        colMap["NAME"] ??
        colMap["Emp. Name"] ??
        colMap["EMPNAME"] ??
        colMap["EMPLOYEE NAME"];

      presentDaysCol =
        type === "staff"
          ? colMap["DAY"]
          : colMap["ADJ DAYS"] ??
            colMap["SALARY(S*T)"] ??
            colMap["SALARY"] ??
            colMap["ACT.DAY"];

      dayCol = colMap["DAY"] ?? colMap["Day"] ?? colMap["day"];

      otCol = colMap["OT"] ?? colMap["ot"];
      dojCol = colMap["DOJ"];

      // RE-DETECT LATE COLUMN ON NEW HEADER
      lateCol =
        type === "staff"
          ? colMap["Final Late"] ?? colMap["FINAL LATE"] ?? colMap["final late"]
          : colMap["LATE"] ?? colMap["Late"] ?? colMap["late"];
      
      continue;
    }

    const empCode = row[codeCol];
    const empName = row[nameCol];
    const presentDays = presentDaysCol !== undefined ? row[presentDaysCol] : null;
    const dayValue = dayCol !== undefined ? row[dayCol] : null;
    const otValue = otCol !== undefined ? row[otCol] : null;
    const lateValue = lateCol !== undefined ? row[lateCol] : null; // EXTRACT LATE VALUE

    if (!empCode && !empName) continue;

    if (empCode && empName) {
      const employeeData: HRData = {
        empCode: String(empCode).trim(),
        empName: String(empName).trim(),
        presentDays: Number(presentDays) || 0,
        day: Number(dayValue) || 0,
      };

      if (otCol !== undefined && otValue !== null && otValue !== undefined) {
        employeeData.OT = Number(otValue) || 0;
      }

      // ADD LATE VALUE TO EMPLOYEE DATA
      if (lateCol !== undefined && lateValue !== null && lateValue !== undefined) {
        employeeData.Late = Number(lateValue) || 0;
      }

      // DOJ: if the employee joined during this salary month, remember the day
      const dojValue = dojCol !== undefined ? row[dojCol] : null;
      const doj = parseDOJ(dojValue);
      if (doj) {
        employeeData.doj = `${String(doj.day).padStart(2, "0")}.${String(doj.month).padStart(2, "0")}.${doj.year}`;
        if (
          salaryMonth &&
          doj.month === salaryMonth.month &&
          doj.year === salaryMonth.year
        ) {
          employeeData.joinDay = doj.day;
        }
      }

      employees.push(employeeData);
    }
  }

  console.log(`✅ Processed ${employees.length} employees from HR file: ${file.name}`);
  console.log(`📝 Sample employee:`, employees[0]);

  return employees;
}