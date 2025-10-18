'use client';

import React, { useState } from 'react';
import { EmployeeData } from '@/lib/types';
import { AttendanceGrid } from './AttendanceGrid';

interface EmployeeCardProps {
  employee: EmployeeData;
  index: number;
}

export const EmployeeCard: React.FC<EmployeeCardProps> = ({ employee, index }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-4 border border-gray-200">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-2">
            <span className="bg-blue-100 text-blue-800 text-sm font-semibold px-3 py-1 rounded">
              #{employee.empCode}
            </span>
            <h3 className="text-xl font-bold text-gray-800">{employee.empName}</h3>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
            <p><span className="font-semibold">Company:</span> {employee.companyName}</p>
            <p><span className="font-semibold">Department:</span> {employee.department}</p>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="ml-4 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm font-semibold"
        >
          {isExpanded ? 'Hide Details' : 'View Details'}
        </button>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <div className="bg-green-50 p-3 rounded-lg text-center">
          <p className="text-xs text-gray-600 mb-1">Present</p>
          <p className="text-lg font-bold text-green-700">{employee.present}</p>
        </div>
        <div className="bg-red-50 p-3 rounded-lg text-center">
          <p className="text-xs text-gray-600 mb-1">Absent</p>
          <p className="text-lg font-bold text-red-700">{employee.absent}</p>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg text-center">
          <p className="text-xs text-gray-600 mb-1">OD</p>
          <p className="text-lg font-bold text-purple-700">{employee.od}</p>
        </div>
        <div className="bg-yellow-50 p-3 rounded-lg text-center">
          <p className="text-xs text-gray-600 mb-1">Week Off</p>
          <p className="text-lg font-bold text-yellow-700">{employee.weekOff}</p>
        </div>
        <div className="bg-blue-50 p-3 rounded-lg text-center">
          <p className="text-xs text-gray-600 mb-1">Holiday</p>
          <p className="text-lg font-bold text-blue-700">{employee.holiday}</p>
        </div>
      </div>

      {/* Expanded Attendance Grid */}
      {isExpanded && (
        <div className="mt-6 border-t pt-6">
          <h4 className="text-lg font-semibold text-gray-800 mb-4">Detailed Attendance</h4>
          <AttendanceGrid days={employee.days} />
        </div>
      )}
    </div>
  );
};
