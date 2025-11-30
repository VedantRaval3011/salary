import * as XLSX from "xlsx-js-style";

export interface UnifiedComparisonRow {
  srNo: number;
  empCode: string;
  empName: string;
  company: string;
  
  // Present Days
  softwarePresentDays: number;
  hrPresentDays: number | null;
  presentDaysDiff: number | string;
  presentDaysCategory: string;

  // Late (Hours)
  softwareLateHours: number;
  hrLateHours: number | null;
  lateDiff: number | string;
  lateCategory: string;

  // OT (Hours)
  softwareOTHours: number;
  hrOTHours: number | null;
  otDiff: number | string;
  otCategory: string;
}

const getStyleForCategory = (category: string) => {
  const baseStyle = {
    font: { name: "Arial", sz: 10 },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    },
  };

  switch (category) {
    case "Major":
      return {
        ...baseStyle,
        fill: { fgColor: { rgb: "FEE2E2" } }, // bg-red-100
        font: { ...baseStyle.font, color: { rgb: "991B1B" }, bold: true }, // text-red-800
      };
    case "Medium":
      return {
        ...baseStyle,
        fill: { fgColor: { rgb: "FFEDD5" } }, // bg-orange-100
        font: { ...baseStyle.font, color: { rgb: "9A3412" }, bold: true }, // text-orange-800
      };
    case "Minor":
      return {
        ...baseStyle,
        fill: { fgColor: { rgb: "FEFCE8" } }, // bg-yellow-50
        font: { ...baseStyle.font, color: { rgb: "854D0E" } }, // text-yellow-800
      };
    case "Match":
      return {
        ...baseStyle,
        fill: { fgColor: { rgb: "F0FDF4" } }, // bg-green-50
        font: { ...baseStyle.font, color: { rgb: "166534" } }, // text-green-800
      };
    default:
      return baseStyle;
  }
};

export const exportUnifiedComparisonToExcel = (data: UnifiedComparisonRow[]) => {
  if (data.length === 0) {
    alert("No data to export.");
    return;
  }

  const wb = XLSX.utils.book_new();
  
  // Create header row
  const headers = [
    "Sr No", "Emp Code", "Emp Name", "Company",
    "Soft. Days", "HR Days", "Diff (Days)",
    "Soft. Late", "HR Late", "Diff (Late)",
    "Soft. OT", "HR OT", "Diff (OT)"
  ];

  const wsData = [headers];

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws["!cols"] = [
    { wch: 6 },  // Sr No
    { wch: 10 }, // Emp Code
    { wch: 25 }, // Emp Name
    { wch: 20 }, // Company
    { wch: 10 }, // Soft. Days
    { wch: 10 }, // HR Days
    { wch: 10 }, // Diff (Days)
    { wch: 10 }, // Soft. Late
    { wch: 10 }, // HR Late
    { wch: 10 }, // Diff (Late)
    { wch: 10 }, // Soft. OT
    { wch: 10 }, // HR OT
    { wch: 10 }, // Diff (OT)
  ];

  // Add data rows with styling
  data.forEach((row, rowIndex) => {
    const r = rowIndex + 1; // 0-indexed data, but 1-indexed for sheet (header is 0)
    
    // Helper to add cell with style
    const addCell = (col: number, val: any, style: any = {}) => {
      const cellRef = XLSX.utils.encode_cell({ r, c: col });
      ws[cellRef] = { v: val, t: typeof val === "number" ? "n" : "s", s: style };
    };

    const baseStyle = {
        font: { name: "Arial", sz: 10 },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        },
    };

    addCell(0, row.srNo, baseStyle);
    addCell(1, row.empCode, baseStyle);
    addCell(2, row.empName, baseStyle);
    addCell(3, row.company, baseStyle);

    // Present Days
    addCell(4, row.softwarePresentDays, baseStyle);
    addCell(5, row.hrPresentDays ?? "N/A", baseStyle);
    addCell(6, row.presentDaysDiff, getStyleForCategory(row.presentDaysCategory));

    // Late
    addCell(7, row.softwareLateHours, baseStyle);
    addCell(8, row.hrLateHours ?? "N/A", baseStyle);
    addCell(9, row.lateDiff, getStyleForCategory(row.lateCategory));

    // OT
    addCell(10, row.softwareOTHours, baseStyle);
    addCell(11, row.hrOTHours ?? "N/A", baseStyle);
    addCell(12, row.otDiff, getStyleForCategory(row.otCategory));
  });

  // Style the header row
  const headerStyle = {
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "4F46E5" } }, // Indigo-600
    alignment: { horizontal: "center", vertical: "center" },
    border: {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      },
  };

  for (let c = 0; c < headers.length; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[cellRef]) ws[cellRef] = { v: headers[c], t: "s" };
    ws[cellRef].s = headerStyle;
  }

  // Set the range
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: headers.length - 1 } });

  XLSX.utils.book_append_sheet(wb, ws, "Unified Comparison");
  XLSX.writeFile(wb, "Unified_Comparison.xlsx");
};
