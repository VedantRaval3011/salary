// pages/index.tsx
"use client";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

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
}

export default function Home() {
  const [data, setData] = useState<AttendanceRecord[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [allowMainPage, setAllowMainPage] = useState(false);
  const MASTER_PASSWORD = "1234"; // change to your password
  const [viewMode, setViewMode] = useState<"table" | "form">("table");
  useEffect(() => {
    setShowPassword(false);
    localStorage.setItem("punchCheck", "false"); // Reset every time page loads
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

      // Detect header row with "EMP Code"
      if (firstCell.includes("EMP Code")) {
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
      const inOutRow = rawData[sec.headerRowIndex + 1] || [];

      // Build dateColumnMap for this section
      const dateColumnMap: { [col: number]: string } = {};
      let lastDateSeen = "";
      if (dateRow && dateRow.length) {
        dateRow.forEach((cell: any, colIdx: number) => {
          if (cell && /\d{1,2}\/\d{1,2}\/\d{4}/.test(cell.toString())) {
            const d = cell.toString();
            if (d !== lastDateSeen) {
              dateColumnMap[colIdx] = d;
              lastDateSeen = d;
            }
          }
        });
      }

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
        if (
          firstCell.includes("Company Name") ||
          firstCell.includes("Department") ||
          firstCell.includes("EMP Code")
        ) {
          break;
        }

        const empCode = row[0]?.toString() || "";
        const empName = row[2]?.toString() || "";

        if (!empCode || !empName) continue;

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
    // --- Check if all punches are OK ---
    const allOk = processedRecords.every((r) => r.misPunch === false);

    if (allOk) {
      // only set true if no issues
      localStorage.setItem("punchCheck", "true");
      setAllowMainPage(true);
    } else {
      // ❌ DO NOT set punchCheck = false if user already unlocked!
      if (localStorage.getItem("punchCheck") !== "true") {
        localStorage.setItem("punchCheck", "false");
      }
      setAllowMainPage(true);
    }
  };

  const formatInOut = (ins: string[] = [], outs: string[] = []) => {
    if ((!ins || ins.length === 0) && (!outs || outs.length === 0)) return "-";

    const pairs: string[] = [];
    const maxLength = Math.max(ins.length, outs.length);

    for (let i = 0; i < maxLength; i++) {
      const inTime = ins[i] || "-";
      const outTime = outs[i] || "-";
      pairs.push(`IN: ${inTime} / OUT: ${outTime}`);
    }

    return pairs.join("\n");
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
        row.push(formatInOut(att.in, att.out));
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
  return (
    <div className="container">
      <style jsx>{`
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes scaleIn {
        from { transform: scale(0.85); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }

      .animate-fadeIn {
        animation: fadeIn 0.25s ease-out;
      }

      .animate-scaleIn {
        animation: scaleIn 0.25s ease-out;
      }

      .container {
        max-width: 100%;
        margin: 0 auto;
        padding: 20px;
        font-family: Arial, sans-serif;
      }
      .header {
        text-align: center;
        margin-bottom: 30px;
      }
      .header h1 {
        color: #333;
      }
      .upload-section {
        background: #f5f5f5;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        text-align: center;
      }
      .file-input {
        padding: 10px;
        margin: 10px 0;
      }
      .button {
        background: #0070f3;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 16px;
        margin: 10px;
      }
      .button:hover {
        background: #0051cc;
      }
      .button:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
      .table-container {
        overflow-x: auto;
        margin-top: 20px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      th, td {
        border: 1px solid #ddd;
        padding: 12px;
        text-align: left;
      }
      th {
        background: #0070f3;
        color: white;
        font-weight: bold;
        position: sticky;
        top: 0;
      }
      tr:nth-child(even) {
        background: #f9f9f9;
      }
      tr:hover {
        background: #f0f0f0;
      }
      .attendance-cell {
        white-space: pre-line;
        font-size: 14px;
      }
      .loading {
        text-align: center;
        padding: 20px;
        font-size: 18px;
        color: #666;
      }
    `}</style>

      <div className="header">
        <h1>📊 Attendance Sheet Transformer</h1>
        <p>
          Upload your attendance Excel file to view it in an improved layout
        </p>
      </div>

      <div className="upload-section rounded-xl shadow-md bg-white border border-gray-200 p-6 text-center">
        <h2 className="text-xl font-semibold mb-3 text-gray-800">
          Upload Attendance File
        </h2>

        <label className="block w-full cursor-pointer">
          <div className="border-2 border-dashed border-gray-300 hover:border-blue-500 transition p-6 rounded-lg">
            <p className="text-gray-600">
              Click to upload Excel (.xlsx / .xls)
            </p>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {data.length > 0 && (
          <button className="mt-4 button" onClick={exportToExcel}>
            📥 Export Improved Excel
          </button>
        )}
      </div>

      {loading && <div className="loading">Processing file...</div>}

      {data.length > 0 && (
        <>
          <div className="flex justify-center mt-6 mb-4">
            <button
              onClick={() => setShowPassword(true)}
              className="px-6 py-3 bg-green-600 text-white rounded-xl shadow hover:bg-green-700 transition font-semibold tracking-wide"
            >
              ✔ Continue to Main Page
            </button>
          </div>

          <div className="flex justify-end mb-4">
            <button
              onClick={() => setViewMode("form")}
              className="px-4 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700"
            >
              Configure Attendance (Form View)
            </button>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Emp Code</th>
                  <th>Employee Name</th>
                  <th>Company</th>
                  <th>Department</th>
                  <th>Status</th>
                  {dates.map((date) => (
                    <th key={date}>{date}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((record, idx) => (
                  <tr
                    key={idx}
                    style={{
                      backgroundColor: record.misPunch
                        ? "rgba(255,0,0,0.12)"
                        : "transparent",
                    }}
                  >
                    <td>{record.empCode}</td>
                    <td>{record.empName}</td>
                    <td>{record.company}</td>
                    <td>{record.department}</td>
                    <td
                      style={{
                        color: record.misPunch ? "red" : "green",
                        fontWeight: "700",
                      }}
                    >
                      {record.misPunch ? "MISPUNCH" : "OK"}
                    </td>
                    {dates.map((date) => {
                      const att = record.attendance[date] || {
                        in: [],
                        out: [],
                      };
                      const bad = record.misPunchDays?.[date] === true;

                      return (
                        <td
                          key={date}
                          className="attendance-cell"
                          style={{
                            backgroundColor: bad
                              ? "rgba(255, 0, 0, 0.20)"
                              : "transparent",
                            border: bad ? "2px solid red" : "1px solid #ddd",
                          }}
                        >
                          {formatInOut(att.in, att.out)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showPassword && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[350px] animate-scaleIn border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-3">
              Admin Verification Required
            </h2>
            <p className="text-gray-600 text-sm mb-4">
              Enter admin password to continue to the main page.
            </p>

            <input
              type="password"
              id="pass"
              className="border border-gray-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-3"
              placeholder="Enter password"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value;
                  const errorEl = document.getElementById("error-msg");

                  if (val === MASTER_PASSWORD) {
                    localStorage.setItem("punchCheck", "true");
                    window.location.href = "/";
                  } else {
                    errorEl?.classList.remove("hidden");
                  }
                }
              }}
            />

            <p id="error-msg" className="text-red-600 text-sm mb-2 hidden">
              ❌ Incorrect password. Please try again.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowPassword(false)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition"
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
                    localStorage.setItem("punchCheck", "true");
                    window.location.href = "/";
                  } else {
                    errorEl?.classList.remove("hidden");
                  }
                }}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
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
