import * as XLSX from "xlsx"; // Import XLSX library

// Interface for the Late Comparison Data for export
export interface LateComparisonExportData {
  empCode: string;
  empName: string;
  softwareTotalHours: number; // Changed from softwareLateHours
  hrLateHours: number | null;
  difference: number | string;
  DifferenceCategory: string;
}

/**
 * Function to export Late Comparison data to an Excel file.
 * This function is analogous to exportOTComparisonToExcel.
 * @param data The structured Late Comparison data.
 * @param filename The desired name of the output file.
 */
export const exportLateComparisonToExcel = (
  data: LateComparisonExportData[],
  filename: string = "Late_Comparison.xlsx"
) => {
  if (data.length === 0) {
    // Using console.warn instead of alert()
    console.warn("No Late comparison data to export.");
    return;
  }

  // Map the comparison data rows to spreadsheet format with descriptive headers
  const ws = XLSX.utils.json_to_sheet(
    data.map((row) => ({
      "Emp Code": row.empCode,
      "Emp Name": row.empName,
      "Software Total (Hours)": row.softwareTotalHours, // Changed header
      "HR (Tulsi) Late (Hours)": row.hrLateHours ?? "N/A",
      "Difference (Hours)": row.difference,
      "Difference Category": row.DifferenceCategory, // Including category for full context
    }))
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Late Comparison");
  XLSX.writeFile(wb, filename);
};
