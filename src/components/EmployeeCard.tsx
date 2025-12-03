// components/EmployeeCard.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { EmployeeData } from "@/lib/types";
import { AttendanceGrid } from "./AttendanceGrid";
import { AdjustmentDayModal } from "./AdjustmentDayModal";
import { PresentDayStatsGrid } from "./PresentDayStatsGrid";
import { useExcel } from "@/context/ExcelContext";
import { OvertimeStatsGrid } from "./OvertimeStatsGrid";
import { EarlyDepartureStatsGrid } from "./EarlyDepartureStatsGrid";
import { useFinalDifference } from "@/context/FinalDifferenceContext";

interface EmployeeCardProps {
  employee: EmployeeData;
  index: number;
  baseHolidaysCount?: number;
  selectedHolidaysCount?: number;
}

// Helper to check if employee is Staff or Worker
const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ""} ${emp.department ?? ""
    }`.toLowerCase();
  if (inStr.includes("c cash")) return false;
  if (inStr.includes("worker")) return false;
  if (inStr.includes("staff")) return true;
  return true; // default to staff
};

// Helper to check custom timing
function useCustomTimingInfo(employee: EmployeeData) {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];

    const customTimingFile = files.find((f: any) => {
      const n = (f?.fileName || "").toString().toLowerCase();
      return (
        f.status === "success" &&
        ((n.includes("09") && n.includes("06") && n.includes("time")) ||
          (n.includes("9") && n.includes("6") && n.includes("granted")))
      );
    });

    if (!customTimingFile) {
      return { hasCustomTiming: false, customTime: null };
    }

    let customTimingEmployees: any[] = [];

    if (
      customTimingFile.customTimingOTData &&
      Array.isArray(customTimingFile.customTimingOTData)
    ) {
      customTimingEmployees = customTimingFile.customTimingOTData;
    } else if (
      customTimingFile.data?.employees &&
      Array.isArray(customTimingFile.data.employees)
    ) {
      customTimingEmployees = customTimingFile.data.employees;
    }

    const norm = (s: string) => (s ?? "").toString().toUpperCase().trim();
    const key = (s: string) => norm(s).replace(/[^A-Z0-9]/g, "");
    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";

    const empCodeK = key(employee.empCode);
    const empNameK = key(employee.empName);
    const numCodeK = numOnly(employee.empCode);

    for (const emp of customTimingEmployees) {
      const codeMatch =
        emp.empCode &&
        (key(emp.empCode) === empCodeK || numOnly(emp.empCode) === numCodeK);
      const nameMatch = emp.empName && key(emp.empName) === empNameK;

      if (codeMatch || nameMatch) {
        return {
          hasCustomTiming: true,
          customTime: emp.customTime || "9:00 TO 6:00", // 🆕 Use actual customTime from data
          totalHours: emp.totalHours || 0,
        };
      }
    }

    return { hasCustomTiming: false, customTime: null };
  }, [employee, getAllUploadedFiles]);
}

// Helper to check Staff OT Granted
function useStaffOTGrantedInfo(employee: EmployeeData) {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];

    const staffOTFile = files.find((f: any) => {
      const n = (f?.fileName || "").toString().toLowerCase();
      return (
        f.status === "success" &&
        n.includes("staff") &&
        n.includes("ot") &&
        n.includes("granted")
      );
    });

    if (!staffOTFile) {
      return { isStaffOTGranted: false };
    }

    let otEmployees: any[] = [];

    if (staffOTFile.otGrantedData && Array.isArray(staffOTFile.otGrantedData)) {
      otEmployees = staffOTFile.otGrantedData;
    } else if (
      staffOTFile.data?.employees &&
      Array.isArray(staffOTFile.data.employees)
    ) {
      otEmployees = staffOTFile.data.employees;
    }

    const norm = (s: string) => (s ?? "").toString().toUpperCase().trim();
    const key = (s: string) => norm(s).replace(/[^A-Z0-9]/g, "");
    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";

    const empCodeK = key(employee.empCode);
    const empNameK = key(employee.empName);
    const numCodeK = numOnly(employee.empCode);

    for (const emp of otEmployees) {
      const codeMatch =
        emp.empCode &&
        (key(emp.empCode) === empCodeK || numOnly(emp.empCode) === numCodeK);
      const nameMatch = emp.empName && key(emp.empName) === empNameK;

      if (codeMatch || nameMatch) {
        return {
          isStaffOTGranted: true,
          fromDate: emp.fromDate,
          toDate: emp.toDate,
        };
      }
    }

    return { isStaffOTGranted: false };
  }, [employee, getAllUploadedFiles]);
}

// Helper to check Full Night Stay OT
function useFullNightOTInfo(employee: EmployeeData) {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];

    const fullNightFile = files.find((f: any) => {
      const n = (f?.fileName || "").toString().toLowerCase();
      return (
        f.status === "success" &&
        n.includes("full") &&
        n.includes("night") &&
        n.includes("stay")
      );
    });

    if (!fullNightFile) {
      return { hasFullNightOT: false, totalHours: 0 };
    }

    let fullNightEmployees: any[] = [];

    if (
      fullNightFile.fullNightOTData &&
      Array.isArray(fullNightFile.fullNightOTData)
    ) {
      fullNightEmployees = fullNightFile.fullNightOTData;
    } else if (
      fullNightFile.data?.employees &&
      Array.isArray(fullNightFile.data.employees)
    ) {
      fullNightEmployees = fullNightFile.data.employees;
    }

    const norm = (s: string) => (s ?? "").toString().toUpperCase().trim();
    const key = (s: string) => norm(s).replace(/[^A-Z0-9]/g, "");
    const numOnly = (s: string) => s.match(/\d+/g)?.join("") ?? "";

    const empCodeK = key(employee.empCode);
    const empNameK = key(employee.empName);
    const numCodeK = numOnly(employee.empCode);

    let totalHours = 0;

    for (const emp of fullNightEmployees) {
      const codeMatch =
        emp.empCode &&
        (key(emp.empCode) === empCodeK || numOnly(emp.empCode) === numCodeK);
      const nameMatch = emp.empName && key(emp.empName) === empNameK;

      if (codeMatch || nameMatch) {
        totalHours += Number(emp.totalHours) || 0;
      }
    }

    return {
      hasFullNightOT: totalHours > 0,
      totalHours,
    };
  }, [employee, getAllUploadedFiles]);
}

export const EmployeeCard: React.FC<EmployeeCardProps> = ({
  employee,
  index,
  baseHolidaysCount = 0,
  selectedHolidaysCount = 0,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [currentEmployee, setCurrentEmployee] =
    useState<EmployeeData>(employee);
  const {
    updateTotalMinus4,
    totalMinus4,
    updatePresentDayTotal,
    updateOvertimeGrandTotal
  } = useFinalDifference();

  const { excelData } = useExcel();
  const [otGrandTotal, setOtGrandTotal] = useState<number>(0);
  const [staticFinalDifference, setStaticFinalDifference] = useState<number>(0);
  const [finalDifference, setFinalDifference] = useState<number>(0);
  const [lateDeductionDays, setLateDeductionDays] = useState<number>(0);
  const { updateFinalDifference } = useFinalDifference();

  // Get custom timing info
  const customTimingInfo = useCustomTimingInfo(currentEmployee);
  const staffOTInfo = useStaffOTGrantedInfo(currentEmployee);
  const fullNightOTInfo = useFullNightOTInfo(currentEmployee);

  // Update local employee state when excelData changes
  useEffect(() => {
    if (excelData?.employees[index]) {
      setCurrentEmployee(excelData.employees[index]);
    }
  }, [excelData, index]);

  // Update when employee prop changes
  useEffect(() => {
    setCurrentEmployee(employee);
  }, [employee]);

  return (
    <div
      id={`employee-${employee.empCode}`} // 🆕 Add this ID
      className="bg-white rounded-lg shadow-md p-6 mb-4 border border-gray-200 transition-all hover:shadow-lg"
    >
      {/* Header Section */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex-1">
          {/* Employee ID and Name */}
          <div className="flex items-center gap-4 mb-3">
            <span className="bg-blue-100 text-blue-800 text-sm font-semibold px-4 py-1.5 rounded-full">
              #{currentEmployee.empCode}
            </span>
            <h3 className="text-xl font-bold text-gray-800">
              {currentEmployee.empName}
            </h3>
            <button
              onClick={() => {
                const target = document.getElementById("comparison-section");
                if (target) {
                  target.scrollIntoView({ behavior: "smooth" });
                }
              }}
              className=" w-5 h-5 flex items-center justify-center rounded-full bg-blue-500 text-white text-sm hover:bg-blue-600 shadow"
              title="Scroll to Comparison"
            >
              ↑
            </button>

            {/* Special Badges */}
            <div className="flex gap-2 ml-2">
              {customTimingInfo.hasCustomTiming && (
                <span className="bg-purple-100 text-purple-800 text-xs font-bold px-3 py-1 rounded-full border border-purple-300 flex items-center gap-1">
                  <span>🕐</span>
                  Custom Timing
                </span>
              )}
              {staffOTInfo.isStaffOTGranted && (
                <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full border border-green-300 flex items-center gap-1">
                  <span>⭐</span>
                  OT Granted
                </span>
              )}
              {fullNightOTInfo.hasFullNightOT && (
                <span className="bg-orange-100 text-orange-800 text-xs font-bold px-3 py-1 rounded-full border border-orange-300 flex items-center gap-1">
                  <span>🌙</span>
                  Full Night
                </span>
              )}
            </div>
          </div>

          {/* Company and Department */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
            <p>
              <span className="font-semibold text-gray-600">Company:</span>{" "}
              <span className="text-gray-800">
                {currentEmployee.companyName}
              </span>
            </p>
            <p>
              <span className="font-semibold text-gray-600">Department:</span>{" "}
              <span className="text-gray-800">
                {currentEmployee.department}
              </span>
            </p>
          </div>

          {/* Custom Timing Info Box */}
          {(customTimingInfo.hasCustomTiming ||
            staffOTInfo.isStaffOTGranted ||
            fullNightOTInfo.hasFullNightOT) && (
              <div className="mt-3 p-3 bg-gradient-to-r from-purple-50 to-blue-50 border-l-4 border-purple-500 rounded-r-lg">
                <div className="text-sm space-y-1">
                  {customTimingInfo.hasCustomTiming && (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-purple-700">
                        🕐 Work Hours:
                      </span>
                      <span className="text-purple-900 font-semibold">
                        {customTimingInfo.customTime}
                      </span>
                      <span className="text-purple-600 text-xs">
                        (Custom {customTimingInfo.totalHours}h/day)
                      </span>
                    </div>
                  )}
                  {staffOTInfo.isStaffOTGranted && (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-green-700">
                        ⭐ OT Period:
                      </span>
                      <span className="text-green-900 font-semibold">
                        Day {staffOTInfo.fromDate} to {staffOTInfo.toDate}
                      </span>
                      <span className="text-green-600 text-xs">
                        (All days eligible for OT)
                      </span>
                    </div>
                  )}
                  {fullNightOTInfo.hasFullNightOT && (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-orange-700">
                        🌙 Full Night Hours:
                      </span>
                      <span className="text-orange-900 font-semibold">
                        {fullNightOTInfo.totalHours} hours
                      </span>
                      <span className="text-orange-600 text-xs">
                        (Added to total OT)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 ml-4 flex-shrink-0">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-all text-sm font-semibold shadow-sm hover:shadow-md"
          >
            {isExpanded ? "Hide Details" : "View Details"}
          </button>
          <button
            onClick={() => setIsAdjustmentModalOpen(true)}
            className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-all text-sm font-semibold shadow-sm hover:shadow-md"
          >
            Adjustment Day
          </button>
        </div>
      </div>
      <PresentDayStatsGrid
        employee={currentEmployee}
        baseHolidaysCount={baseHolidaysCount}
        selectedHolidaysCount={selectedHolidaysCount}
        finalDifference={finalDifference}
        lateDeductionDays={lateDeductionDays} // 🆕 Pass to PresentDayStatsGrid
        onTotalCalculated={(total) => updatePresentDayTotal(employee.empCode, total)}
      />
      <EarlyDepartureStatsGrid
        employee={employee}
        otGrandTotal={otGrandTotal}
        staticFinalDifference={staticFinalDifference}
        onFinalDifferenceCalculated={(difference) => {
          setFinalDifference(difference);
          updateFinalDifference(employee.empCode, difference);
        }}
        onStaticFinalDifferenceCalculated={(staticDiff) => {
          setStaticFinalDifference((prev) => (prev === staticDiff ? prev : staticDiff));

          // Calculate Late Deduction Days with different buffers for Staff vs Worker
          // Staff: 30-minute buffer, always applies
          // Non-Staff: If final difference ≤ 2 hours, no deduction. If > 2 hours, deduct only excess beyond 2 hours (min 0.5)
          // IMPORTANT: Use staticFinalDifference (not finalDifference) for late deduction
          let deduction = 0;
          if (staticDiff < 0) {
            const absDiff = Math.abs(staticDiff);
            // Unified logic (Staff Rules for Everyone): 30-minute buffer
            const bufferMinutes = 30;
            const exceeds4Hours = absDiff > 240;
            const bufferedDiff = Math.max(0, absDiff - bufferMinutes);

            // Calculate deduction: every 240 minutes (4 hours) after buffer = 0.5 days
            if (bufferedDiff >= 240) {
              deduction = Math.floor(bufferedDiff / 240) * 0.5;
              // If there's a remainder, add 0.5 days
              if (bufferedDiff % 240 > 0) {
                deduction += 0.5;
              }
            } else if (bufferedDiff > 0) {
              // Less than 240 minutes but more than 0
              deduction = 0.5;
            }

            // If the original difference exceeds 4 hours, ensure minimum 1.0 days deduction
            if (exceeds4Hours && deduction < 1.0) {
              deduction = 1.0;
            }

            console.log(
              `🔍 ${employee.empName} - ` +
              `Static Final Diff: ${staticDiff} mins, Abs: ${absDiff} mins, ` +
              `Exceeds 4hrs: ${exceeds4Hours}, Buffer: ${bufferMinutes} mins, ` +
              `Buffered: ${bufferedDiff} mins, Deduction: ${deduction} days`
            );
          }
          setLateDeductionDays(deduction);
        }}
        onTotalMinus4Calculated={(empCode, total) =>
          updateTotalMinus4(empCode, total)
        }
      />
      <OvertimeStatsGrid
        employee={employee}
        onGrandTotalCalculated={(total) => {
          setOtGrandTotal((prev) => (prev === total ? prev : total));
          updateOvertimeGrandTotal(employee.empCode, total);
        }}
        onStaticFinalDifferenceCalculated={(staticDiff) =>
          setStaticFinalDifference((prev) => (prev === staticDiff ? prev : staticDiff))
        }
        lateDeductionDays={lateDeductionDays} // 🆕 Pass to OvertimeStatsGrid
      />

      {/* Expanded Attendance Grid Section */}
      {isExpanded && (
        <div className="mt-8 pt-8 border-t-2 border-gray-200">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">📋</span>
            <h4 className="text-lg font-bold text-gray-800">
              Detailed Attendance Record
            </h4>
            <span className="text-xs font-semibold text-gray-500">
              ({currentEmployee.days?.length || 0} days)
            </span>
          </div>

          {/* Special Work Schedule Info */}
          {customTimingInfo.hasCustomTiming && (
            <div className="mb-4 p-4 bg-purple-50 border-2 border-purple-200 rounded-lg">
              <div className="flex items-start gap-3">
                <span className="text-3xl">🕐</span>
                <div>
                  <h5 className="font-bold text-purple-900 mb-1">
                    Custom Work Schedule
                  </h5>
                  <p className="text-sm text-purple-800">
                    This employee has a{" "}
                    <strong>
                      customized work schedule of {customTimingInfo.customTime}
                    </strong>{" "}
                    instead of the standard 8:30 TO 5:30 timing.
                  </p>
                  <p className="text-xs text-purple-700 mt-2">
                    💡 <strong>Note:</strong> Overtime calculations are adjusted
                    based on this custom schedule.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Attendance Grid */}
          {currentEmployee.days && currentEmployee.days.length > 0 ? (
            <AttendanceGrid
              days={currentEmployee.days}
              employeeIndex={index}
              onAdjustmentClick={(date) => {
                console.log(`Clicked on date: ${date}`);
              }}
              customTime={customTimingInfo.customTime} // Pass the custom time from computed info
              employee={currentEmployee} // 🆕 Pass employee data for lunch/punch lookup
            />
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <p className="text-gray-500 text-sm">
                No attendance data available
              </p>
            </div>
          )}
        </div>
      )}
      {/* Adjustment Day Modal */}
      <AdjustmentDayModal
        employee={currentEmployee}
        employeeIndex={index}
        isOpen={isAdjustmentModalOpen}
        onClose={() => setIsAdjustmentModalOpen(false)}
      />
    </div>
  );
};
