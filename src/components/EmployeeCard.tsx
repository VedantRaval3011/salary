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

     <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4">
  {/* Present */}
  <div className="bg-green-50 p-4 rounded-lg text-center">
    <div className="text-gray-600 text-sm mb-1">Present</div>
    <div className="text-2xl font-bold text-green-600">{employee.present}</div>
  </div>

  {/* Absent */}
  <div className="bg-red-50 p-4 rounded-lg text-center">
    <div className="text-gray-600 text-sm mb-1">Absent</div>
    <div className="text-2xl font-bold text-red-600">{employee.absent}</div>
  </div>

  {/* OD */}
  <div className="bg-purple-50 p-4 rounded-lg text-center">
    <div className="text-gray-600 text-sm mb-1">OD</div>
    <div className="text-2xl font-bold text-purple-600">{employee.od}</div>
  </div>

  {/* Week Off */}
  <div className="bg-yellow-50 p-4 rounded-lg text-center">
    <div className="text-gray-600 text-sm mb-1">Week Off</div>
    <div className="text-2xl font-bold text-yellow-600">{employee.weekOff}</div>
  </div>

  {/* Holiday */}
  <div className="bg-blue-50 p-4 rounded-lg text-center">
    <div className="text-gray-600 text-sm mb-1">Holiday</div>
    <div className="text-2xl font-bold text-blue-600">{employee.holiday}</div>
  </div>

  {/* Leave - NEW */}
  <div className="bg-orange-50 p-4 rounded-lg text-center">
    <div className="text-gray-600 text-sm mb-1">Leave</div>
    <div className="text-2xl font-bold text-orange-600">{employee.leave}</div>
  </div>

  {/* OT Hours - NEW */}
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
          <h4 className="text-lg font-semibold text-gray-800 mb-4">Detailed Attendance</h4>
          <AttendanceGrid days={employee.days} />
        </div>
      )}
    </div>
  );
};
