import * as ExcelJS from "exceljs";
import {
  ProcessedExcelData,
  EmployeeData,
  DayAttendance,
  AttendanceData,
} from "@/lib/types";

// Helper function to safely convert cell values to string
function cellValueToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    if ("richText" in value)
      return value.richText.map((rt: any) => rt.text).join("");
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text ?? "");
    if ("error" in value) return String(value.error ?? "");
  }

  return String(value);
}

// Helper function to process individual employee block
function processEmployeeBlock(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  defaultCompanyName: string
): EmployeeData | null {
  const employee: EmployeeData = {
    companyName: defaultCompanyName,
    department: "",
    empCode: "",
    empName: "",
    present: 0,
    od: 0,
    absent: 0,
    weekOff: 0,
    holiday: 0,
    days: [],
  };

  let dateRow: ExcelJS.CellValue[] = [];
  let dayRow: string[] = [];

  // Look backwards from startRow to find the company name and department for this employee
  for (let lookbackRow = startRow - 1; lookbackRow >= Math.max(1, startRow - 15); lookbackRow--) {
    const row = worksheet.getRow(lookbackRow);
    const firstCell = cellValueToString(row.getCell(1).value);
    
    // Find the company name (closest one before this employee)
    if (firstCell.includes("Company Name") && firstCell.includes(":")) {
      employee.companyName = firstCell.replace(/Company Name\s*:\s*/i, "").trim();
    }
    
    // Find the department
    if (firstCell.includes("Department") && firstCell.includes(":")) {
      employee.department = firstCell.replace(/Department\s*:\s*/i, "").trim();
    }
    
    // Stop if we hit another employee (going too far back)
    if (firstCell.includes("Emp Code :")) {
      break;
    }
  }

  for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const firstCell = cellValueToString(row.getCell(1).value);
    const secondCell = cellValueToString(row.getCell(2).value);

    // Employee details row
    if (firstCell.includes("Emp Code :")) {
      const empCodeMatch = firstCell.match(/Emp Code\s*:\s*(\d+)/);
      if (empCodeMatch) employee.empCode = empCodeMatch[1];

      const empNameCell = cellValueToString(row.getCell(4).value);
      if (empNameCell.includes("Emp Name :")) {
        employee.empName = empNameCell.replace("Emp Name :", "").trim();
      }

      const presentCell = cellValueToString(row.getCell(9).value);
      if (presentCell.includes("Present :")) {
        employee.present =
          parseFloat(presentCell.replace("Present :", "").trim()) || 0;
      }

      const odCell = cellValueToString(row.getCell(11).value);
      if (odCell.includes("OD :")) {
        employee.od = parseFloat(odCell.replace("OD :", "").trim()) || 0;
      }

      const absentCell = cellValueToString(row.getCell(13).value);
      if (absentCell.includes("Absent :")) {
        employee.absent =
          parseFloat(absentCell.replace("Absent :", "").trim()) || 0;
      }

      const holidayCell = cellValueToString(row.getCell(15).value);
      if (holidayCell.includes("Holiday")) {
        employee.holiday =
          parseFloat(holidayCell.replace(/Holiday[s]?\s*:\s*/i, "").trim()) ||
          0;
      }

      const weekOffCell = cellValueToString(row.getCell(17).value);
      if (
        weekOffCell.includes("Weekly Off") ||
        weekOffCell.includes("Week Off")
      ) {
        employee.weekOff =
          parseFloat(
            weekOffCell.replace(/Week(?:ly)?\s+Off\s*:\s*/i, "").trim()
          ) || 0;
      }
    }

    // Date row (starts with 1 in column 2)
    if (secondCell && !isNaN(Number(secondCell)) && Number(secondCell) === 1) {
      dateRow = [];
      for (let col = 2; col <= 31; col++) {
        dateRow.push(row.getCell(col).value);
      }
    }

    // Day row
    if (["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].includes(secondCell)) {
      dayRow = [];
      for (let col = 2; col <= 31; col++) {
        dayRow.push(cellValueToString(row.getCell(col).value));
      }
    }

    // Attendance data row
    if (firstCell.includes("Shift") && firstCell.includes("In Time")) {
      const days: DayAttendance[] = [];

      for (let col = 2; col <= 31; col++) {
        const cellString = cellValueToString(row.getCell(col).value);
        const lines = cellString.split("\n");

        if (lines.length >= 8) {
          const attendance: AttendanceData = {
            shift: lines[0]?.trim() || "",
            inTime: lines[1]?.trim() || "",
            outTime: lines[2]?.trim() || "",
            lateMins: lines[3]?.trim() || "0",
            earlyDep: lines[4]?.trim() || "0",
            otHrs: lines[5]?.trim() || "0:00",
            workHrs: lines[6]?.trim() || "0:00",
            status: lines[7]?.trim() || "",
          };

          const dateIndex = col - 2;
          const dateValue = dateRow[dateIndex];
          const dateNumber =
            typeof dateValue === "number"
              ? dateValue
              : Number(cellValueToString(dateValue)) || 0;

          days.push({
            date: dateNumber,
            day: dayRow[dateIndex] || "",
            attendance,
          });
        }
      }

      employee.days = days;
    }
  }

  return employee.empCode ? employee : null;
}

export async function processExcelFile(
  file: File
): Promise<ProcessedExcelData> {
  try {
    console.log("File info:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    // Basic validations
    if (file.size === 0) {
      throw new Error("File is empty");
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error("File size exceeds 10MB limit");
    }

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Failed to read file contents");
    }

    console.log("ArrayBuffer size:", arrayBuffer.byteLength);

    // Create workbook and load with better error handling
    const workbook = new ExcelJS.Workbook();

    try {
      await workbook.xlsx.load(arrayBuffer);
    } catch (xlsxError: any) {
      console.error("XLSX load error:", xlsxError);

      if (
        xlsxError.message?.includes("zip") ||
        xlsxError.message?.includes("central directory") ||
        xlsxError.message?.includes("signature")
      ) {
        if (file.name.toLowerCase().endsWith(".xls")) {
          throw new Error(
            "This appears to be an old Excel format (.xls). " +
              "Please open the file in Excel and save it as .xlsx format, then try again."
          );
        }

        throw new Error(
          "Unable to read the Excel file. The file may be corrupted or in an unsupported format. " +
            "Please ensure it is a valid .xlsx file. If the file was downloaded or received via email, " +
            "try opening it in Excel first and re-saving it."
        );
      }

      throw xlsxError;
    }

    if (!workbook.worksheets || workbook.worksheets.length === 0) {
      throw new Error("No worksheets found in the Excel file");
    }

    const worksheet = workbook.worksheets[0];

    if (!worksheet.actualRowCount || worksheet.actualRowCount === 0) {
      throw new Error("The worksheet is empty");
    }

    console.log(
      "Worksheet loaded successfully, rows:",
      worksheet.actualRowCount
    );

    // Extract title and period from first row
    let title = "";
    let period = "";
    const firstRow = worksheet.getRow(1);
    const firstCellValue = cellValueToString(firstRow.getCell(1).value);
    if (firstCellValue) {
      const parts = firstCellValue.split("For Period");
      title = parts[0]?.trim() || "";
      period = parts[1]?.replace(/:/g, "").trim() || "";
    }

    // Extract default company name (appears at the top)
    let defaultCompanyName = "";

    for (
      let rowNum = 1;
      rowNum <= Math.min(10, worksheet.actualRowCount);
      rowNum++
    ) {
      const row = worksheet.getRow(rowNum);
      const firstCell = cellValueToString(row.getCell(1).value);

      if (firstCell.includes("Company Name :")) {
        defaultCompanyName = firstCell.replace("Company Name :", "").trim();
        break;
      }
    }

    // First pass: Collect all employee row numbers
    const employeeRows: number[] = [];
    let maxRowSeen = 0;

    worksheet.eachRow((row, rowNumber) => {
      const firstCell = cellValueToString(row.getCell(1).value);

      if (firstCell.includes("Emp Code :")) {
        employeeRows.push(rowNumber);
      }

      maxRowSeen = Math.max(maxRowSeen, rowNumber);
    });

    console.log("=== EMPLOYEE DETECTION ===");
    console.log("Total employee rows found:", employeeRows.length);
    console.log("First employee row:", employeeRows[0]);
    console.log("Last employee row:", employeeRows[employeeRows.length - 1]);
    console.log("Max row seen during iteration:", maxRowSeen);

    // Second pass: Process each employee block
    const employees: EmployeeData[] = [];

    for (let i = 0; i < employeeRows.length; i++) {
      const startRow = employeeRows[i];
      const endRow =
        i + 1 < employeeRows.length ? employeeRows[i + 1] - 1 : maxRowSeen;

      const employee = processEmployeeBlock(
        worksheet,
        startRow,
        endRow,
        defaultCompanyName
      );

      if (employee) {
        employees.push(employee);
        if (i >= employeeRows.length - 3) {
          console.log(
            `  ✓ Employee ${i + 1}: ${employee.empCode} - ${employee.empName}, Company: ${employee.companyName}, Dept: ${employee.department}, ${employee.days.length} days`
          );
        }
      } else {
        console.warn(`  ✗ Employee ${i + 1} failed to process`);
      }
    }

    console.log("\n=== PROCESSING COMPLETE ===");
    console.log("Total employees processed:", employees.length);
    console.log(
      "First employee:",
      employees[0]
        ? `${employees[0].empCode} - ${employees[0].empName} (${employees[0].companyName} - ${employees[0].department})`
        : "None"
    );
    console.log(
      "Last employee:",
      employees.length > 0
        ? `${employees[employees.length - 1].empCode} - ${
            employees[employees.length - 1].empName
          } (${employees[employees.length - 1].companyName} - ${employees[employees.length - 1].department})`
        : "None"
    );

    // Count employees per company
    const companyCount: { [key: string]: number } = {};
    employees.forEach((emp) => {
      if (emp.companyName) {
        companyCount[emp.companyName] = (companyCount[emp.companyName] || 0) + 1;
      }
    });
    console.log("\n=== EMPLOYEES PER COMPANY ===");
    Object.entries(companyCount).forEach(([company, count]) => {
      console.log(`${company}: ${count} employees`);
    });

    // Check for missing data and warn
    employees.forEach((emp, idx) => {
      if (!emp.empCode || !emp.empName) {
        console.warn(`Employee ${idx + 1} has missing data:`, emp);
      }
      if (!emp.days || emp.days.length === 0) {
        console.warn(
          `Employee ${idx + 1} (${emp.empCode}) has no attendance days`
        );
      }
      if (!emp.department) {
        console.warn(
          `Employee ${idx + 1} (${emp.empCode} - ${emp.empName}) has no department`
        );
      }
      if (!emp.companyName) {
        console.warn(
          `Employee ${idx + 1} (${emp.empCode} - ${emp.empName}) has no company name`
        );
      }
    });

    if (employees.length === 0) {
      throw new Error(
        "No employee data found in the Excel file. Please check that the file format matches the expected template."
      );
    }

    return { title, period, employees };
  } catch (error: any) {
    console.error("Excel processing error:", error);

    const errorMessage = error.message || "Unknown error occurred";
    throw new Error(`Failed to process Excel file: ${errorMessage}`);
  }
}
