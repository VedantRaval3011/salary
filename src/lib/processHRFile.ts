import * as XLSX from "xlsx";

export interface HRData {
  empCode: string;
  empName: string;
  presentDays: number;
  OT?: number;
  Late?: number; // ADD LATE FIELD
}

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
      : colMap["SALARY(S*T)"] ?? colMap["SALARY"] ?? colMap["ACT.DAY"];

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
          : colMap["SALARY(S*T)"] ?? colMap["SALARY"] ?? colMap["ACT.DAY"];

      otCol = colMap["OT"] ?? colMap["ot"];
      
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
    const otValue = otCol !== undefined ? row[otCol] : null;
    const lateValue = lateCol !== undefined ? row[lateCol] : null; // EXTRACT LATE VALUE

    if (!empCode && !empName) continue;

    if (empCode && empName) {
      const employeeData: HRData = {
        empCode: String(empCode).trim(),
        empName: String(empName).trim(),
        presentDays: Number(presentDays) || 0,
      };

      if (otCol !== undefined && otValue !== null && otValue !== undefined) {
        employeeData.OT = Number(otValue) || 0;
      }

      // ADD LATE VALUE TO EMPLOYEE DATA
      if (lateCol !== undefined && lateValue !== null && lateValue !== undefined) {
        employeeData.Late = Number(lateValue) || 0;
      }

      employees.push(employeeData);
    }
  }

  console.log(`✅ Processed ${employees.length} employees from HR file: ${file.name}`);
  console.log(`📝 Sample employee:`, employees[0]);

  return employees;
}