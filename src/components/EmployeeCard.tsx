'use client';

import React, { useState, useEffect } from 'react';
import { EmployeeData } from '@/lib/types';
import { AttendanceGrid } from './AttendanceGrid';
import { AdjustmentDayModal } from './AdjustmentDayModal';
import { useExcel } from '@/context/ExcelContext';

interface EmployeeCardProps {
  employee: EmployeeData;
  index: number;
}

export const EmployeeCard: React.FC<EmployeeCardProps> = ({ employee, index }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [currentEmployee, setCurrentEmployee] = useState<EmployeeData>(employee);
  const { excelData } = useExcel();

  // Update local employee state when excelData changes (after bulk adjustments)
  useEffect(() => {
    if (excelData?.employees[index]) {
      setCurrentEmployee(excelData.employees[index]);
    }
  }, [excelData, index]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-4 border border-gray-200">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-2">
            <span className="bg-blue-100 text-blue-800 text-sm font-semibold px-3 py-1 rounded">
              #{currentEmployee.empCode}
            </span>
            <h3 className="text-xl font-bold text-gray-800">{currentEmployee.empName}</h3>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
            <p>
              <span className="font-semibold">Company:</span> {currentEmployee.companyName}
            </p>
            <p>
              <span className="font-semibold">Department:</span>{' '}
              {currentEmployee.department}
            </p>
          </div>
        </div>

       <div className="flex gap-2 ml-4">
  <button
    onClick={() => setIsExpanded(!isExpanded)}
    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm font-semibold"
  >
    {isExpanded ? 'Hide Details' : 'View Details'}
  </button>
  <button
    onClick={() => setIsAdjustmentModalOpen(true)}
    className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors text-sm font-semibold"
  >
    Adjustment Day
  </button>
</div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {/* Present */}
        <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="text-xs text-gray-600 font-semibold">Present</div>
          <div className="text-2xl font-bold text-green-600">{currentEmployee.present || 0}</div>
        </div>
        {/* Absent */}
        <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
          <div className="text-xs text-gray-600 font-semibold">Absent</div>
          <div className="text-2xl font-bold text-red-600">{currentEmployee.absent || 0}</div>
        </div>
        {/* Holiday */}
        <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="text-xs text-gray-600 font-semibold">Holiday</div>
          <div className="text-2xl font-bold text-blue-600">{currentEmployee.holiday || 0}</div>
        </div>
        {/* Week Off */}
        <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-600 font-semibold">Week Off</div>
          <div className="text-2xl font-bold text-gray-600">{currentEmployee.weekOff || 0}</div>
        </div>
        {/* OD */}
        <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
          <div className="text-xs text-gray-600 font-semibold">OD</div>
          <div className="text-2xl font-bold text-purple-600">{currentEmployee.od || 0}</div>
        </div>
        {/* Leave */}
        <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
          <div className="text-xs text-gray-600 font-semibold">Leave</div>
          <div className="text-2xl font-bold text-yellow-600">{currentEmployee.leave || 0}</div>
        </div>
        {/* Adjustments */}
        <div className="text-center p-3 bg-lime-50 rounded-lg border border-lime-200">
          <div className="text-xs text-gray-600 font-semibold">Adjustments</div>
          <div className="text-2xl font-bold text-lime-600">
            {currentEmployee.adjustments?.length || 0}
          </div>
        </div>

        <div className="bg-indigo-50 p-4 rounded-lg text-center">
    <div className="text-gray-600 text-sm mb-1">OT Hours</div>
    <div className="text-xl font-bold text-indigo-600">{employee.totalOTHours}</div>
  </div>

  {/* Work Hours - NEW */}
  <div className="bg-teal-50 p-4 rounded-lg text-center">
    <div className="text-gray-600 text-sm mb-1">Work Hours</div>
    <div className="text-xl font-bold text-teal-600">{employee.totalWorkHours}</div>
  </div>

    {/* Late Mins - NEW */}
  <div className="bg-pink-50 p-4 rounded-lg text-center">
    <div className="text-gray-600 text-sm mb-1">Late Mins</div>
    <div className="text-2xl font-bold text-pink-600">{employee.totalLateMins}</div>
  </div>

  {/* Early Dep - NEW */}
  <div className="bg-amber-50 p-4 rounded-lg text-center">
    <div className="text-gray-600 text-sm mb-1">Early Dep</div>
    <div className="text-2xl font-bold text-amber-600">{employee.totalEarlyDep}</div>
  </div>

      </div>

      {/* Expanded Attendance Grid */}
      {isExpanded && (
        <div className="mt-6 border-t pt-6">
          <h4 className="text-lg font-semibold text-gray-800 mb-4">
            Detailed Attendance
          </h4>
          <AttendanceGrid days={currentEmployee.days} employeeIndex={index} />
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
