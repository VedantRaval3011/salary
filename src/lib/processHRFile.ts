// lib/processHRFile.ts
import * as XLSX from "xlsx";

export interface HRData {
  empCode: string;
  empName: string;
  presentDays: number;
  OT?: number; // Add OT field
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

  const data: any[] = XLSX.utils.sheet_to_json(worksheet, {
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
      `Could not find header row in HR file. (Searched for: ${searchTerms.join(
        ", "
      )})`
    );
  }

  const header: string[] = data[headerRowIndex].map(String);
  const colMap = getColumnMap(header);

  const codeCol =
    colMap["Emp. Code"] ??
    colMap["EMP CODE"] ??
    colMap["Emp Code"] ??
    colMap["Employee Code"] ??
    colMap["EMP. ID"];

  const nameCol =
    colMap["Employee Name"] ??
    colMap["NAME"] ??
    colMap["Emp. Name"] ??
    colMap["EMPNAME"] ??
    colMap["EMPLOYEE NAME"];

  // Present Days Column (for attendance comparison)
  const presentDaysCol =
    type === "staff"
      ? colMap["DAY"]
      : colMap["SALARY(S*T)"] ?? colMap["SALARY"] ?? colMap["ACT.DAY"];

  // --- FIX: OT Column Detection ---
  // For Staff: Column I contains "OT"
  // For Worker: Column F contains "OT"
  const otCol = colMap["OT"] ?? colMap["ot"];
  // --- END OF FIX ---

  if (codeCol === undefined || nameCol === undefined) {
    throw new Error(
      `Could not find 'Emp. Code' or 'Name' columns in the header row: [${header.join(
        ", "
      )}]`
    );
  }

  if (presentDaysCol === undefined) {
    let errorHint = "";
    if (type === "staff") {
      errorHint = "Looked for 'DAY' (H-col)";
    } else {
      errorHint = "Looked for 'SALARY(S*T)', 'SALARY', or 'ACT.DAY' (U-col)";
    }

    throw new Error(
      `Could not find present days column. ${errorHint}. Header was: [${header.join(
        ", "
      )}]`
    );
  }

  console.log(
    `📊 Found present days column at index: ${presentDaysCol}, header: "${header[presentDaysCol]}"`
  );

  if (otCol !== undefined) {
    console.log(`📊 Found OT column at index: ${otCol}, header: "${header[otCol]}"`);
  } else {
    console.warn(
      `⚠️ Could not find OT column in header: [${header.join(", ")}]`
    );
  }

  const employees: HRData[] = [];
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    const empCode = row[codeCol];
    const empName = row[nameCol];
    const presentDays = row[presentDaysCol];
    const otValue = otCol !== undefined ? row[otCol] : null;

    if (!empCode && !empName) {
      continue;
    }

    if (empCode && empName) {
      const employeeData: HRData = {
        empCode: String(empCode).trim(),
        empName: String(empName).trim(),
        presentDays: Number(presentDays) || 0,
      };

      // Add OT if column was found and has a value
      if (otCol !== undefined && otValue !== null && otValue !== undefined) {
        employeeData.OT = Number(otValue) || 0;
      }

      employees.push(employeeData);
    }
  }

  console.log(
    `✅ Processed ${employees.length} employees from HR file: ${file.name}`
  );
  console.log(`📝 Sample employee with OT:`, employees[0]);

  return employees;
}