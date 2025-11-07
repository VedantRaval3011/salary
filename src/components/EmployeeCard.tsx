// components/EmployeeCard.tsx
"use client";

import React, { useState, useEffect } from "react";
import { EmployeeData } from "@/lib/types";
import { AttendanceGrid } from "./AttendanceGrid";
import { AdjustmentDayModal } from "./AdjustmentDayModal";
import { PresentDayStatsGrid } from "./PresentDayStatsGrid";
import { useExcel } from "@/context/ExcelContext";
import { OvertimeStatsGrid } from "./OvertimeStatsGrid";

interface EmployeeCardProps {
  employee: EmployeeData;
  index: number;
  baseHolidaysCount?: number;
  selectedHolidaysCount?: number;
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
  const { excelData } = useExcel();

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
    <div className="bg-white rounded-lg shadow-md p-6 mb-4 border border-gray-200 transition-all hover:shadow-lg">
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
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 ml-4 flex-shrink-0">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-all text-sm font-semibold shadow-sm hover:shadow-md">
            {isExpanded ? "Hide Details" : "View Details"}
          </button>
          <button
            onClick={() => setIsAdjustmentModalOpen(true)}
            className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-all text-sm font-semibold shadow-sm hover:shadow-md">
            Adjustment Day
          </button>
        </div>
      </div>



      {/* Present Day Calculation Stats Grid */}
      <PresentDayStatsGrid
        employee={currentEmployee}
        baseHolidaysCount={baseHolidaysCount}
        selectedHolidaysCount={selectedHolidaysCount}
      />

      <OvertimeStatsGrid employee={employee} />

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

          {/* Attendance Grid */}
          {currentEmployee.days && currentEmployee.days.length > 0 ? (
            <AttendanceGrid
              days={currentEmployee.days}
              employeeIndex={index}
              onAdjustmentClick={(date) => {
                // Handle click on a specific date if needed
                console.log(`Clicked on date: ${date}`);
              }}
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

      {/* Quick Stats Summary (Compact view when collapsed) */}
      {!isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-600">
          <div className="flex items-center justify-between">
            <span>
              <strong>Days Summary:</strong> {currentEmployee.present || 0}P |{" "}
              {currentEmployee.absent || 0}A | {currentEmployee.holiday || 0}H
            </span>
            <span className="text-blue-600 font-semibold cursor-pointer hover:text-blue-800">
              Click "View Details" for full breakdown →
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
