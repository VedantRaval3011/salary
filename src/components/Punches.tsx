// pages/index.tsx
"use client";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { usePunchVerification } from "@/context/PunchVerificationContext";
import { usePunchData } from "@/context/PunchDataContext";

interface AttendanceDay {
  in: string[];
  out: string[];
}

interface AttendanceRecord {
  empCode: string;
  empName: string;
  company: string;
  department: string;
  attendance: {
    [date: string]: {
      in: string[];
      out: string[];
    };
  };
  misPunch: boolean;
  misPunchDays: { [date: string]: boolean }; // ✅ NEW
  otGrantedType?: string; // Add this to track if employee is fullnight
}

// ===== BREAK EXCESS CALCULATION =====

const BREAKS = [
  { name: "Tea Break 1", start: 10 * 60 + 15, end: 10 * 60 + 30, allowed: 15 },
  { name: "Lunch Break", start: 12 * 60, end: 14 * 60 + 30, allowed: 30 },
  { name: "Tea Break 2", start: 15 * 60 + 15, end: 15 * 60 + 30, allowed: 15 },
];

const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === "-") return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  const [hours, minutes] = parts;
  return hours * 60 + (minutes || 0);
};

/**
 * Calculate break excess for a specific date's punches
 */
const calculateBreakExcess = (
  ins: string[],
  outs: string[],
  isFullNight: boolean = false
): number => {
  if (!ins || !outs || ins.length === 0 || outs.length === 0) return 0;

  // Combine and sort punches
  const punches: { type: "In" | "Out"; minutes: number; time: string }[] = [];
  
  ins.forEach((time) => {
    const minutes = timeToMinutes(time);
    if (minutes > 0) punches.push({ type: "In", minutes, time });
  });
  
  outs.forEach((time) => {
    const minutes = timeToMinutes(time);
    if (minutes > 0) punches.push({ type: "Out", minutes, time });
  });

  // Sort by time
  punches.sort((a, b) => a.minutes - b.minutes);

  // Clean up invalid sequences (ensure IN-OUT-IN-OUT pattern)
  const cleanedPunches: typeof punches = [];
  let expectedNext: "In" | "Out" = "In";
  
  for (const punch of punches) {
    if (punch.type === expectedNext) {
      cleanedPunches.push(punch);
      expectedNext = expectedNext === "In" ? "Out" : "In";
    }
  }

  if (cleanedPunches.length < 2) return 0;

  let totalExcess = 0;
  const CUTOFF_TIME = 17 * 60 + 30; // 5:30 PM

  // Calculate break excess for each Out-In pair
  for (let i = 0; i < cleanedPunches.length - 1; i++) {
    const current = cleanedPunches[i];
    const next = cleanedPunches[i + 1];

    // Only process Out-In pairs (break periods)
    if (current.type === "Out" && next.type === "In" && current.minutes < next.minutes) {
      let outMin = current.minutes;
      let inMin = next.minutes;

      // Handle 5:30 PM cutoff for non-fullnight employees
      if (!isFullNight) {
        if (outMin >= CUTOFF_TIME) {
          continue; // Ignore breaks starting after 5:30 PM
        }
        if (inMin > CUTOFF_TIME) {
          inMin = CUTOFF_TIME; // Truncate to 5:30 PM
        }
      }

      const duration = inMin - outMin;
      if (duration <= 0) continue;

      // Calculate allowed time based on break windows
      let allowed = 0;
      for (const defBreak of BREAKS) {
        const overlapStart = Math.max(outMin, defBreak.start);
        const overlapEnd = Math.min(inMin, defBreak.end);
        const overlap = Math.max(0, overlapEnd - overlapStart);
        if (overlap > 0) allowed += defBreak.allowed;
      }

      // Evening break allowance (after 5:30 PM)
      if (outMin >= 17 * 60 + 30 || inMin >= 17 * 60 + 30) {
        allowed = Math.max(allowed, 15);
      }

      const excess = Math.max(0, duration - allowed);
      totalExcess += excess;
    }
  }

  return Math.round(totalExcess);
};

export default function Home() {
  const { setVerified } = usePunchVerification();
  const { setPunchData } = usePunchData();
  const [data, setData] = useState<AttendanceRecord[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [allowMainPage, setAllowMainPage] = useState(false);
  const MASTER_PASSWORD = "1234"; // change to your password
  const [viewMode, setViewMode] = useState<"table" | "form">("table");
  
  // Sorting state
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);

  useEffect(() => {
    setShowPassword(false);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const binaryStr = event.target?.result;
        const workbook = XLSX.read(binaryStr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
        });

        processData(jsonData);
      } catch (error) {
        console.error("Error processing file:", error);
        alert("Error processing file. Please check the format.");
      } finally {
        setLoading(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  // Helper: convert excel serial numeric time (fraction of day) to HH:MM
  const excelSerialToTime = (serial: number): string => {
    if (serial === null || serial === undefined || isNaN(serial)) return "-";
    const timePortion = serial - Math.floor(serial);
    const totalSeconds = Math.round(timePortion * 86400);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}`;
  };

  const validatePunchStatus = (records: AttendanceRecord[]) => {
    const allOk = records.every((r) => r.misPunch === false);
    return allOk;
  };

  // Main parser — section-aware and misPunch detection
  const processData = (rawData: any[][]) => {
    const processedRecords: AttendanceRecord[] = [];
    const dateSet = new Set<string>();

    // First pass: detect sections (company+department + date row + header row index)
    type Section = {
      company: string;
      department: string;
      dateRowIndex: number;
      headerRowIndex: number;
      startRow: number;
    };

    const sections: Section[] = [];

    let curCompany = "";
    let curDepartment = "";
    let lastDateRowIdx = -1;

    for (let r = 0; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row || row.length === 0) continue;

      const firstCell = row[0]?.toString?.() || "";

      // Company Name detection
      if (firstCell.includes("Company Name")) {
        curCompany = firstCell.replace(/Company Name\s*:?/i, "").trim();
        lastDateRowIdx = -1;
        continue;
      }

      // Department detection
      if (firstCell.includes("Department")) {
        curDepartment = firstCell.replace(/Department\s*:?/i, "").trim();
        continue;
      }

      // Detect date row (contains dd/mm/yyyy)
      const hasDate = row.some(
        (c: any) =>
          c &&
          typeof c.toString === "function" &&
          /\d{1,2}\/\d{1,2}\/\d{4}/.test(c.toString())
      );
      if (hasDate) {
        lastDateRowIdx = r;
        // don't continue; header might be on same row rarely
      }

      // Detect header row with "EMP Code" (case-insensitive and flexible)
      if (firstCell.match(/emp\s*code/i)) {
        const headerIdx = r;
        const dateRowIndexToUse = lastDateRowIdx !== -1 ? lastDateRowIdx : -1;
        sections.push({
          company: curCompany,
          department: curDepartment,
          dateRowIndex: dateRowIndexToUse,
          headerRowIndex: headerIdx,
          startRow: headerIdx + 2,
        });
        lastDateRowIdx = -1;
        console.log(`Found section (EMP Code): ${curCompany} - ${curDepartment} at row ${headerIdx}`);
        continue; // Skip In/Out pattern check for this row
      }
      
      // Alternative: Detect In/Out row pattern (for files without EMP Code header)
      // This row typically has "In" and "Out" alternating
      const hasInOutPattern = row.filter((c: any) => {
        const str = (c?.toString() || "").toLowerCase().trim();
        return str === "in" || str === "out";
      }).length >= 4; // At least 4 In/Out labels
      
      // Only add In/Out pattern section if we haven't just added an EMP Code section
      // Check if the last section was added in the previous row (would be EMP Code + In/Out row)
      const lastSectionRow = sections.length > 0 ? sections[sections.length - 1].headerRowIndex : -1;
      const isNotDuplicate = lastSectionRow === -1 || r - lastSectionRow > 2;
      
      if (hasInOutPattern && lastDateRowIdx !== -1 && isNotDuplicate) {
        const headerIdx = r;
        sections.push({
          company: curCompany,
          department: curDepartment,
          dateRowIndex: lastDateRowIdx,
          headerRowIndex: headerIdx,
          startRow: headerIdx + 1, // Employee data starts right after In/Out row
        });
        lastDateRowIdx = -1;
        console.log(`Found section (In/Out pattern): ${curCompany} - ${curDepartment} at row ${headerIdx}`);
      }
    }

    // fallback if no section found: try to find any header/date
    if (sections.length === 0) {
      let fallbackHeader = -1;
      let fallbackDate = -1;
      for (let r = 0; r < rawData.length; r++) {
        const row = rawData[r];
        if (!row) continue;
        if (row.some((c: any) => c && /EMP Code/i.test(c.toString()))) {
          fallbackHeader = r;
        }
        if (
          row.some(
            (c: any) =>
              c &&
              typeof c.toString === "function" &&
              /\d{1,2}\/\d{1,2}\/\d{4}/.test(c.toString())
          )
        ) {
          fallbackDate = r;
        }
      }
      if (fallbackHeader !== -1) {
        sections.push({
          company: "",
          department: "",
          dateRowIndex: fallbackDate,
          headerRowIndex: fallbackHeader,
          startRow: fallbackHeader + 2,
        });
      }
    }

    // Process each section
    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      if (sec.headerRowIndex === -1) continue;

      const dateRow = sec.dateRowIndex !== -1 ? rawData[sec.dateRowIndex] : [];
      
      // Determine the In/Out row based on the format
      // Check if headerRowIndex row contains "EMP Code" (Format 1) or "In/Out" pattern (Format 2)
      const headerRow = rawData[sec.headerRowIndex] || [];
      const headerFirstCell = (headerRow[0]?.toString() || "").toLowerCase();
      const isEmpCodeFormat = /emp\s*code/i.test(headerFirstCell);
      
      // For EMP Code format: In/Out row is headerRowIndex + 1
      // For In/Out pattern format: In/Out row is headerRowIndex itself
      const inOutRow = isEmpCodeFormat 
        ? (rawData[sec.headerRowIndex + 1] || [])
        : (rawData[sec.headerRowIndex] || []);
      
      console.log(`Section ${s}: ${isEmpCodeFormat ? 'EMP Code' : 'In/Out Pattern'} format, inOutRow at ${isEmpCodeFormat ? sec.headerRowIndex + 1 : sec.headerRowIndex}`);

      // Build dateColumnMap for this section
      // This maps each column index to its corresponding date
      const dateColumnMap: { [col: number]: string } = {};
      const dateColumns: number[] = []; // Track which columns have dates
      
      if (dateRow && dateRow.length) {
        dateRow.forEach((cell: any, colIdx: number) => {
          if (cell && /\d{1,2}\/\d{1,2}\/\d{4}/.test(cell.toString())) {
            const d = cell.toString();
            dateColumns.push(colIdx);
            dateColumnMap[colIdx] = d;
          }
        });
        
        // Now map all columns between dates to their respective date
        // For example, if date is in column 3, columns 4,5,6 (In/Out) belong to that date
        for (let i = 0; i < dateColumns.length; i++) {
          const dateCol = dateColumns[i];
          const nextDateCol = dateColumns[i + 1] || dateRow.length;
          const currentDate = dateColumnMap[dateCol];
          
          // Map all columns from current date column to next date column
          for (let c = dateCol; c < nextDateCol; c++) {
            dateColumnMap[c] = currentDate;
          }
        }
      }
      
      console.log(`Date columns mapped for section:`, Object.keys(dateColumnMap).length, 'column mappings');

      // Add dates to global set
      Object.values(dateColumnMap).forEach((d) => dateSet.add(d));

      // compute endRow as next section header or end of sheet
      let endRow = rawData.length;
      if (s + 1 < sections.length) {
        endRow = sections[s + 1].headerRowIndex;
      }

      // iterate employees
      for (let r = sec.startRow; r < endRow; r++) {
        const row = rawData[r];
        if (!row || row.length === 0) continue;

        const firstCell = row[0]?.toString?.() || "";
        // Break if we hit another section header (case-insensitive)
        if (
          /company\s*name/i.test(firstCell) ||
          /department/i.test(firstCell) ||
          /emp\s*code/i.test(firstCell)
        ) {
          break;
        }

        const empCode = row[0]?.toString() || "";
        const empName = row[2]?.toString() || "";

        // Only skip if empCode is missing (empName can be empty)
        if (!empCode || empCode.trim() === "") continue;

        // initialize attendance for dates in this section
        const attendance: { [date: string]: { in: string[]; out: string[] } } =
          {};
        Object.values(dateColumnMap).forEach((d) => {
          attendance[d] = { in: [], out: [] };
        });

        let currentDate = "";
        for (let c = 0; c < row.length; c++) {
          if (dateColumnMap[c]) currentDate = dateColumnMap[c];

          const cellValue = row[c];
          if (
            cellValue === null ||
            cellValue === undefined ||
            currentDate === ""
          ) {
            continue;
          }

          const typeRaw = inOutRow[c];
          const type = typeRaw?.toString?.().toLowerCase?.() || "";

          // convert to time string
          let timeStr = "-";
          if (typeof cellValue === "number") {
            timeStr = excelSerialToTime(cellValue);
          } else {
            const parsed = parseFloat(cellValue.toString());
            if (!isNaN(parsed)) {
              timeStr = excelSerialToTime(parsed);
            } else {
              const txt = cellValue.toString().trim();
              if (/\d{1,2}:\d{2}/.test(txt)) timeStr = txt;
              else timeStr = txt || "-";
            }
          }

          if (type === "in") {
            if (!attendance[currentDate])
              attendance[currentDate] = { in: [], out: [] };
            attendance[currentDate].in.push(timeStr);
          } else if (type === "out") {
            if (!attendance[currentDate])
              attendance[currentDate] = { in: [], out: [] };
            attendance[currentDate].out.push(timeStr);
          } else {
            // unknown type — skip
          }
        }

        // Detect mis-punch (Rule A):
        // misPunch = true if in.length !== out.length OR any entry is "-"
        // --- Detect mis-punch ---
        // Per-day flags
        const misPunchDays: { [date: string]: boolean } = {};

        Object.entries(attendance).forEach(([dte, d]) => {
          const inCount = d.in.length;
          const outCount = d.out.length;

          // Rule A: mismatch OR "-" inside
          const dayIssue =
            inCount !== outCount || d.in.includes("-") || d.out.includes("-");

          misPunchDays[dte] = dayIssue;
        });

        // Overall employee misPunch = ANY date has issue
        const misPunch = Object.values(misPunchDays).includes(true);

        processedRecords.push({
          empCode,
          empName,
          company: sec.company,
          department: sec.department,
          attendance,
          misPunch,
          misPunchDays, // NEW
        });
      }
    }

    // unify dates across all records
    const uniqueDates = Array.from(dateSet).sort((a, b) => {
      const pa = a.split("/").map((x) => parseInt(x, 10));
      const pb = b.split("/").map((x) => parseInt(x, 10));
      const da = new Date(pa[2], pa[1] - 1, pa[0]);
      const db = new Date(pb[2], pb[1] - 1, pb[0]);
      return da.getTime() - db.getTime();
    });

    processedRecords.forEach((rec) => {
      uniqueDates.forEach((d) => {
        if (!rec.attendance[d]) rec.attendance[d] = { in: [], out: [] };
      });
    });

    setDates(uniqueDates);
    setData(processedRecords);
    
    // ✅ Populate the PunchData context with the processed records
    setPunchData(processedRecords.map(rec => ({
      empCode: rec.empCode,
      empName: rec.empName,
      company: rec.company,
      department: rec.department,
      attendance: rec.attendance,
      otGrantedType: rec.otGrantedType
    })));
    
    // Log processing results
    console.log(`✅ Processed ${processedRecords.length} employees across ${uniqueDates.length} dates`);
    console.log(`Sections found: ${sections.length}`);
    
    // --- Check if all punches are OK ---
    const allOk = processedRecords.every((r) => r.misPunch === false);

    if (allOk) {
      // only set true if no issues
      setVerified(true);
      setAllowMainPage(true);
    } else {
      // Don't automatically set to false - user can still bypass with password
      setAllowMainPage(true);
    }
  };

  const formatInOut = (ins: string[] = [], outs: string[] = [], isFullNight: boolean = false) => {
    if ((!ins || ins.length === 0) && (!outs || outs.length === 0)) return { text: "-", breakExcess: 0 };

    const pairs: string[] = [];
    const maxLength = Math.max(ins.length, outs.length);

    for (let i = 0; i < maxLength; i++) {
      const inTime = ins[i] || "-";
      const outTime = outs[i] || "-";
      pairs.push(`IN: ${inTime} / OUT: ${outTime}`);
    }

    // Calculate break excess
    const breakExcess = calculateBreakExcess(ins, outs, isFullNight);

    return {
      text: pairs.join("\n"),
      breakExcess: breakExcess
    };
  };

  const exportToExcel = () => {
    const exportData: any[] = [];

    // Header: include Status column after Department
    const headerRow = [
      "Emp Code",
      "Employee Name",
      "Company",
      "Department",
      "Status",
      ...dates,
    ];
    exportData.push(headerRow);

    data.forEach((record) => {
      const row: any[] = [
        record.empCode,
        record.empName,
        record.company,
        record.department,
        record.misPunch ? "MISPUNCH" : "OK",
      ];

      dates.forEach((date) => {
        const att = record.attendance[date] || { in: [], out: [] };
        const isFullNight = record.otGrantedType === "fullnight";
        const punchData = formatInOut(att.in, att.out, isFullNight);
        
        // Combine text and break excess for export
        let cellValue = punchData.text;
        if (punchData.breakExcess > 0) {
          cellValue += `\n⚠ Break Excess: +${punchData.breakExcess}m`;
        }
        
        row.push(cellValue);
      });

      exportData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");

    // Auto-size columns
    const colWidths = exportData[0].map((_: any, i: number) => ({
      wch:
        Math.max(
          ...exportData.map((row) => (row[i]?.toString() || "").length)
        ) + 2,
    }));
    ws["!cols"] = colWidths;

    XLSX.writeFile(
      wb,
      `Attendance_Improved_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  // Sorting function
  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  // Get sorted data
  const getSortedData = () => {
    if (!sortConfig) return data;

    const sortedData = [...data].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (sortConfig.key === "empCode") {
        aValue = a.empCode;
        bValue = b.empCode;
      } else if (sortConfig.key === "empName") {
        aValue = a.empName;
        bValue = b.empName;
      } else if (sortConfig.key === "company") {
        aValue = a.company;
        bValue = b.company;
      } else if (sortConfig.key === "department") {
        aValue = a.department;
        bValue = b.department;
      } else if (sortConfig.key === "status") {
        aValue = a.misPunch ? "MISPUNCH" : "OK";
        bValue = b.misPunch ? "MISPUNCH" : "OK";
      } else {
        // Date column sorting - sort by number of punches
        const aAtt = a.attendance[sortConfig.key] || { in: [], out: [] };
        const bAtt = b.attendance[sortConfig.key] || { in: [], out: [] };
        aValue = aAtt.in.length + aAtt.out.length;
        bValue = bAtt.in.length + bAtt.out.length;
      }

      if (aValue < bValue) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });

    return sortedData;
  };

  const sortedData = getSortedData();
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">📊 Attendance Punch Viewer</h1>
          <p className="text-gray-600 mt-1">Upload and review employee attendance with break excess tracking</p>
        </div>
      </div>

      <div className="mx-auto px-6 py-6">
        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Upload Attendance File</h2>
              <p className="text-sm text-gray-500 mt-1">Select an Excel file to view attendance records</p>
            </div>
            
            <label className="cursor-pointer">
              <div className="px-6 py-2.5 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Choose File
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {data.length > 0 && (
            <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
              <button 
                onClick={exportToExcel}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                📥 Export to Excel
              </button>
              <button
                onClick={() => setShowPassword(true)}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg font-medium hover:bg-green-700 transition-colors shadow-sm"
              >
                ✔ Continue to Main Page
              </button>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
            <p className="text-gray-600 mt-4 font-medium">Processing file...</p>
          </div>
        )}

        {/* Table Section */}
        {data.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mt-0.5">{data.length} employees • {dates.length} days</p>
              </div>
            </div>
            
            {/* Table with fixed height and horizontal scroll */}
            <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
              <table className="w-full border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th 
                      onClick={() => handleSort("empCode")}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b-2 border-gray-200 bg-gray-50 sticky left-0 z-20 cursor-pointer hover:bg-gray-100 select-none"
                    >
                      <div className="flex items-center gap-1">
                        Emp Code
                        {sortConfig?.key === "empCode" && (
                          <span className="text-blue-600">
                            {sortConfig.direction === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort("empName")}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b-2 border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100 select-none"
                    >
                      <div className="flex items-center gap-1">
                        Employee Name
                        {sortConfig?.key === "empName" && (
                          <span className="text-blue-600">
                            {sortConfig.direction === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort("company")}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b-2 border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100 select-none"
                    >
                      <div className="flex items-center gap-1">
                        Company
                        {sortConfig?.key === "company" && (
                          <span className="text-blue-600">
                            {sortConfig.direction === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort("department")}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b-2 border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100 select-none"
                    >
                      <div className="flex items-center gap-1">
                        Department
                        {sortConfig?.key === "department" && (
                          <span className="text-blue-600">
                            {sortConfig.direction === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort("status")}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b-2 border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100 select-none"
                    >
                      <div className="flex items-center gap-1">
                        Status
                        {sortConfig?.key === "status" && (
                          <span className="text-blue-600">
                            {sortConfig.direction === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </div>
                    </th>
                    {dates.map((date) => (
                      <th 
                        key={date}
                        onClick={() => handleSort(date)}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b-2 border-gray-200 bg-gray-50 min-w-[180px] cursor-pointer hover:bg-gray-100 select-none"
                      >
                        <div className="flex items-center gap-1">
                          {date}
                          {sortConfig?.key === date && (
                            <span className="text-blue-600">
                              {sortConfig.direction === "asc" ? "↑" : "↓"}
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedData.map((record, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-gray-50 transition-colors ${
                        record.misPunch ? "bg-red-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 border-r border-gray-200 sticky left-0 bg-white">
                        {record.empCode}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200">
                        {record.empName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 border-r border-gray-200">
                        {record.company}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 border-r border-gray-200">
                        {record.department}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold border-r border-gray-200">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          record.misPunch 
                            ? "bg-red-100 text-red-800" 
                            : "bg-green-100 text-green-800"
                        }`}>
                          {record.misPunch ? "MISPUNCH" : "OK"}
                        </span>
                      </td>
                      {dates.map((date) => {
                        const att = record.attendance[date] || {
                          in: [],
                          out: [],
                        };
                        const bad = record.misPunchDays?.[date] === true;
                        const isFullNight = record.otGrantedType === "fullnight";
                        const punchData = formatInOut(att.in, att.out, isFullNight);

                        return (
                          <td
                            key={date}
                            className={`px-4 py-3 text-sm border-r border-gray-200 ${
                              bad ? "bg-red-100 border-red-300" : ""
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                                {punchData.text}
                              </div>
                              {punchData.breakExcess > 0 && (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-md text-xs font-semibold">
                                  <span className="text-red-600">⚠</span>
                                  Break Excess: +{punchData.breakExcess}m
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Password Modal */}
      {showPassword && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in duration-200">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Admin Verification Required
            </h2>
            <p className="text-gray-600 text-sm mb-6">
              Enter admin password to continue to the main page.
            </p>

            <input
              type="password"
              id="pass"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none mb-4"
              placeholder="Enter password"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value;
                  const errorEl = document.getElementById("error-msg");

                  if (val === MASTER_PASSWORD) {
                    setVerified(true);
                    setShowPassword(false);
                  } else {
                    errorEl?.classList.remove("hidden");
                  }
                }
              }}
            />

            <p id="error-msg" className="text-red-600 text-sm mb-4 hidden">
              ❌ Incorrect password. Please try again.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowPassword(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const val = (
                    document.getElementById("pass") as HTMLInputElement
                  ).value;
                  const errorEl = document.getElementById("error-msg");

                  if (val === MASTER_PASSWORD) {
                    setVerified(true);
                    setShowPassword(false);
                  } else {
                    errorEl?.classList.remove("hidden");
                  }
                }}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
