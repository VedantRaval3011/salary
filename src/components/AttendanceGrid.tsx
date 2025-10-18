'use client';

import React from 'react';
import { DayAttendance } from '@/lib/types';

interface AttendanceGridProps {
  days: DayAttendance[];
}

export const AttendanceGrid: React.FC<AttendanceGridProps> = ({ days }) => {
  const getStatusColor = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'P') return 'bg-green-100 text-green-800 border-green-300';
    if (s === 'A') return 'bg-red-100 text-red-800 border-red-300';
    if (s === 'WO') return 'bg-gray-100 text-gray-800 border-gray-300';
    if (s === 'H') return 'bg-blue-100 text-blue-800 border-blue-300';
    return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {days.map((day, index) => (
        <div
          key={index}
          className={`border-2 rounded-lg p-4 ${getStatusColor(day.attendance.status)}`}
        >
          {/* Day Header */}
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-current border-opacity-30">
            <span className="text-lg font-bold">{day.date}</span>
            <span className="text-sm font-semibold">{day.day}</span>
          </div>

          {/* Attendance Details - Now in vertical layout */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="font-semibold">Shift:</span>
              <span>{day.attendance.shift || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">In Time:</span>
              <span>{day.attendance.inTime || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Out Time:</span>
              <span>{day.attendance.outTime || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Late Mins:</span>
              <span>{day.attendance.lateMins || '0'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Early Dep:</span>
              <span>{day.attendance.earlyDep || '0'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">OT Hours:</span>
              <span>{day.attendance.otHrs || '0:00'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Work Hours:</span>
              <span className="font-bold">{day.attendance.workHrs || '0:00'}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-current border-opacity-30">
              <span className="font-semibold">Status:</span>
              <span className="font-bold text-lg">{day.attendance.status || '-'}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
