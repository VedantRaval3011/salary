"use client";

import React, { useMemo, useState } from "react";
import { usePunchData } from "@/context/PunchDataContext";
import { ChevronDown, ChevronUp } from "lucide-react";
import * as XLSX from "xlsx";

interface PunchStatusSummaryProps {
  className?: string;
}

interface EmployeePunchRecord {
  empCode: string;
  empName: string;
  company: string;
  department: string;
  misPunch: boolean;
  attendance: {
    [date: string]: {
      in: string[];
      out: string[];
      hasMismatch: boolean;
    };
  };
}

export const PunchStatusSummary: React.FC<PunchStatusSummaryProps> = ({ className = "" }) => {
  const { getAllPunchData } = usePunchData();
  const [showOKTable, setShowOKTable] = useState(false);
  const [showMismatchTable, setShowMismatchTable] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);

  // Process punch data
  const { okRecords, mismatchRecords, allDates } = useMemo(() => {
    const allPunchData = getAllPunchData();
    
    const okRecs: EmployeePunchRecord[] = [];
    const mismatchRecs: EmployeePunchRecord[] = [];
    const dateSet = new Set<string>();

    allPunchData.forEach((employee) => {
      let hasMismatch = false;
      const processedAttendance: EmployeePunchRecord["attendance"] = {};

      Object.entries(employee.attendance || {}).forEach(([date, dayData]) => {
        dateSet.add(date);
        
        const ins = dayData.in || [];
        const outs = dayData.out || [];

        const dayHasMismatch =
          ins.length !== outs.length ||
          ins.includes("-") ||
          outs.includes("-");

        if (dayHasMismatch && (ins.length > 0 || outs.length > 0)) {
          hasMismatch = true;
        }

        processedAttendance[date] = {
          in: ins,
          out: outs,
          hasMismatch: dayHasMismatch && (ins.length > 0 || outs.length > 0),
        };
      });

      const record: EmployeePunchRecord = {
        empCode: employee.empCode,
        empName: employee.empName,
        company: employee.company || "N/A",
        department: employee.department || "N/A",
        misPunch: hasMismatch,
        attendance: processedAttendance,
      };

      if (hasMismatch) {
        mismatchRecs.push(record);
      } else {
        okRecs.push(record);
      }
    });

    // Sort dates
    const sortedDates = Array.from(dateSet).sort((a, b) => {
      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(dateStr);
      };
      return parseDate(a).getTime() - parseDate(b).getTime();
    });

    return {
      okRecords: okRecs,
      mismatchRecords: mismatchRecs,
      allDates: sortedDates,
    };
  }, [getAllPunchData]);

  const formatInOut = (ins: string[], outs: string[]) => {
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

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getSortedData = (data: EmployeePunchRecord[]) => {
    if (!sortConfig) return data;

    const sorted = [...data].sort((a, b) => {
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
        // Date column sorting
        const aAtt = a.attendance[sortConfig.key] || { in: [], out: [] };
        const bAtt = b.attendance[sortConfig.key] || { in: [], out: [] };
        aValue = aAtt.in.length + aAtt.out.length;
        bValue = bAtt.in.length + bAtt.out.length;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortConfig.direction === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
    });

    return sorted;
  };

  const exportToExcel = (records: EmployeePunchRecord[], filename: string) => {
    const exportData: any[] = [];

    // Header
    const headerRow = ["Emp Code", "Employee Name", "Company", "Department", "Status", ...allDates];
    exportData.push(headerRow);

    // Data rows
    records.forEach((record) => {
      const row: any[] = [
        record.empCode,
        record.empName,
        record.company,
        record.department,
        record.misPunch ? "MISPUNCH" : "OK",
      ];

      allDates.forEach((date) => {
        const att = record.attendance[date] || { in: [], out: [] };
        row.push(formatInOut(att.in, att.out));
      });

      exportData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Punch Status");

    const colWidths = exportData[0].map((_: any, i: number) => ({
      wch: Math.max(...exportData.map((row) => (row[i]?.toString() || "").length)) + 2,
    }));
    ws["!cols"] = colWidths;

    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  if (okRecords.length === 0 && mismatchRecords.length === 0) {
    return null;
  }

  const sortedOKData = getSortedData(okRecords);
  const sortedMismatchData = getSortedData(mismatchRecords);

  return (
    <div className={`w-full max-w-7xl mx-auto ${className}`}>
      {/* OK Punch Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-4">
            <button
              onClick={() => setShowOKTable(!showOKTable)}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-bold shadow-md hover:bg-green-700 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {showOKTable ? "Hide OK Punch" : `Show OK Punch (${okRecords.length})`}
              {showOKTable ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {showOKTable && (
              <button
                onClick={() => exportToExcel(sortedOKData, "OK_Punch")}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-bold shadow-md hover:bg-blue-700 transition-all"
              >
                📥 Export to Excel
              </button>
            )}
          </div>
        </div>

        {showOKTable && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <p className="text-sm text-gray-500">{okRecords.length} employees • {allDates.length} days</p>
            </div>

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
                    {allDates.map((date) => (
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
                  {sortedOKData.map((record, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
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
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          OK
                        </span>
                      </td>
                      {allDates.map((date) => {
                        const att = record.attendance[date] || { in: [], out: [] };
                        return (
                          <td key={date} className="px-4 py-3 text-sm border-r border-gray-200">
                            <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                              {formatInOut(att.in, att.out)}
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

      {/* Mismatch Punch Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-4">
            <button
              onClick={() => setShowMismatchTable(!showMismatchTable)}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg font-bold shadow-md hover:bg-red-700 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {showMismatchTable ? "Hide Mismatch Punch" : `Show Mismatch Punch (${mismatchRecords.length})`}
              {showMismatchTable ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {showMismatchTable && (
              <button
                onClick={() => exportToExcel(sortedMismatchData, "Mismatch_Punch")}
                className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg font-bold shadow-md hover:bg-orange-700 transition-all"
              >
                📥 Export to Excel
              </button>
            )}
          </div>
        </div>

        {showMismatchTable && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <p className="text-sm text-gray-500">{mismatchRecords.length} employees • {allDates.length} days</p>
            </div>

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
                    {allDates.map((date) => (
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
                  {sortedMismatchData.map((record, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-gray-50 transition-colors"
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
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                          MISPUNCH
                        </span>
                      </td>
                      {allDates.map((date) => {
                        const att = record.attendance[date] || { in: [], out: [], hasMismatch: false };
                        const bad = att.hasMismatch;

                        return (
                          <td
                            key={date}
                            className={`px-4 py-3 text-sm border-r border-gray-200 ${
                              bad ? "bg-red-100 border-red-300" : ""
                            }`}
                          >
                            <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                              {formatInOut(att.in, att.out)}
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
    </div>
  );
};
