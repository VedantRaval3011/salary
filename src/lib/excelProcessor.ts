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
  currentCompanyName: string,
  currentDepartment: string
): EmployeeData | null {
  const employee: EmployeeData = {
    companyName: currentCompanyName,
    department: currentDepartment,
    empCode: "",
    empName: "",
    present: 0,
    od: 0,
    absent: 0,
    weekOff: 0,
    holiday: 0,
    leave: 0,
    totalOTHours: "0:00",
    totalWorkHours: "0:00",
    totalLateMins: 0, // ADD THIS
    totalEarlyDep: 0, // ADD THIS
    days: [],
  };

  let dateRow: ExcelJS.CellValue[] = [];
  let dayRow: string[] = [];

  // Look backwards from startRow to update company name and department if found in this block
  for (
    let lookbackRow = startRow - 1;
    lookbackRow >= Math.max(1, startRow - 5);
    lookbackRow--
  ) {
    const row = worksheet.getRow(lookbackRow);
    const firstCell = cellValueToString(row.getCell(1).value);

    if (firstCell.includes("Emp Code :")) {
      break;
    }

    if (firstCell.includes("Company Name") && firstCell.includes(":")) {
      employee.companyName = firstCell
        .replace(/Company Name\s*:\s*/i, "")
        .trim();
    }

    if (firstCell.includes("Department") && firstCell.includes(":")) {
      employee.department = firstCell.replace(/Department\s*:\s*/i, "").trim();
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

      // Extract Leave - Column 20 (index 20)
      const leaveCell = cellValueToString(row.getCell(20).value);
      if (leaveCell.includes("Leave :")) {
        employee.leave =
          parseFloat(leaveCell.replace("Leave :", "").trim()) || 0;
      }

      // Extract OT Hrs - Column 22 (index 22)
      const otHrsCell = cellValueToString(row.getCell(22).value);
      if (otHrsCell.includes("OT Hrs :")) {
        employee.totalOTHours =
          otHrsCell.replace("OT Hrs :", "").trim() || "0:00";
      }

      // Extract Work Hrs - Column 24 (index 24)
      const workHrsCell = cellValueToString(row.getCell(24).value);
      if (workHrsCell.includes("Work Hrs :")) {
        employee.totalWorkHours =
          workHrsCell.replace("Work Hrs :", "").trim() || "0:00";
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

      // Calculate total Late Mins and Early Dep (excluding P/A status and Saturdays)
      let totalLateMins = 0;
      let totalEarlyDep = 0;

      employee.days.forEach((day) => {
        const status = day.attendance.status.toUpperCase();
        const dayOfWeek = day.day.toLowerCase();

        // Only count if:
        // 1. Status is NOT PA (Partial Absence)
        // 2. Day is NOT Saturday
        if (status !== "PA" && status !== "P/A" && dayOfWeek !== "sa") {
          totalLateMins += parseInt(String(day.attendance.lateMins)) || 0;
          totalEarlyDep += parseInt(String(day.attendance.earlyDep)) || 0;
        }
      });

      employee.totalLateMins = totalLateMins;
      employee.totalEarlyDep = totalEarlyDep;
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

    if (file.size === 0) {
      throw new Error("File is empty");
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error("File size exceeds 10MB limit");
    }

    const arrayBuffer = await file.arrayBuffer();

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Failed to read file contents");
    }

    console.log("ArrayBuffer size:", arrayBuffer.byteLength);

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
            "Please ensure it is a valid .xlsx file."
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

    let title = "";
    let period = "";
    const firstRow = worksheet.getRow(1);
    const firstCellValue = cellValueToString(firstRow.getCell(1).value);
    if (firstCellValue) {
      const parts = firstCellValue.split("For Period");
      title = parts[0]?.trim() || "";
      period = parts[1]?.replace(/:/g, "").trim() || "";
    }

    const employeeRows: number[] = [];
    const companyDeptMap: Map<number, { company: string; department: string }> =
      new Map();
    let maxRowSeen = 0;
    let currentCompany = "";
    let currentDept = "";

    worksheet.eachRow((row, rowNumber) => {
      const firstCell = cellValueToString(row.getCell(1).value);

      if (firstCell.includes("Company Name") && firstCell.includes(":")) {
        currentCompany = firstCell.replace(/Company Name\s*:\s*/i, "").trim();
      }

      if (firstCell.includes("Department") && firstCell.includes(":")) {
        currentDept = firstCell.replace(/Department\s*:\s*/i, "").trim();
      }

      if (firstCell.includes("Emp Code :")) {
        employeeRows.push(rowNumber);
        companyDeptMap.set(rowNumber, {
          company: currentCompany,
          department: currentDept,
        });
      }

      maxRowSeen = Math.max(maxRowSeen, rowNumber);
    });

    console.log("=== EMPLOYEE DETECTION ===");
    console.log("Total employee rows found:", employeeRows.length);

    const employees: EmployeeData[] = [];

    for (let i = 0; i < employeeRows.length; i++) {
      const startRow = employeeRows[i];
      const endRow =
        i + 1 < employeeRows.length ? employeeRows[i + 1] - 1 : maxRowSeen;

      const companyDept = companyDeptMap.get(startRow) || {
        company: "",
        department: "",
      };

      const employee = processEmployeeBlock(
        worksheet,
        startRow,
        endRow,
        companyDept.company,
        companyDept.department
      );

      if (employee) {
        employees.push(employee);
      }
    }

    console.log("\n=== PROCESSING COMPLETE ===");
    console.log("Total employees processed:", employees.length);

    if (employees.length === 0) {
      throw new Error("No employee data found in the Excel file.");
    }

    return { title, period, employees };
  } catch (error: any) {
    console.error("Excel processing error:", error);

    const errorMessage = error.message || "Unknown error occurred";
    throw new Error(`Failed to process Excel file: ${errorMessage}`);
  }
}
