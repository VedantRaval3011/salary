import * as XLSX from "xlsx";

export interface ComparisonData {
  empCode: string;
  empName: string;
  softwarePresentDays: number;
  hrPresentDays: number | null;
  difference: number | string;
}

export interface OTComparisonData {
  empCode: string;
  empName: string;
  softwareOTHours: number;
  hrOTHours: number | null;
  difference: number | string;
}

// ✅ Export for Present Day Comparison
export const exportComparisonToExcel = (data: ComparisonData[]) => {
  if (data.length === 0) {
    alert("No comparison data to export.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(
    data.map((row) => ({
      "Emp Code": row.empCode,
      "Emp Name": row.empName,
      "Software Grand Total": row.softwarePresentDays,
      "HR Present Days": row.hrPresentDays ?? "N/A",
      Difference: row.difference,
    }))
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Present Day Comparison");
  XLSX.writeFile(wb, "Present_Day_Comparison.xlsx");
};

// ✅ Separate export function for OT comparison
export const exportOTComparisonToExcel = (
  data: OTComparisonData[],
  filename: string = "OT_Comparison.xlsx"
) => {
  if (data.length === 0) {
    alert("No OT comparison data to export.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(
    data.map((row) => ({
      "Emp Code": row.empCode,
      "Emp Name": row.empName,
      "Software OT (Hours)": row.softwareOTHours,
      "HR (Tulsi) OT (Hours)": row.hrOTHours ?? "N/A",
      Difference: row.difference,
    }))
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "OT Comparison");
  XLSX.writeFile(wb, filename);
};
