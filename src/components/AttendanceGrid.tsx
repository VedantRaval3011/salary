// components/AttendanceGrid.tsx
'use client';

import React from 'react';
import { DayAttendance } from '@/lib/types';

interface AttendanceGridProps {
  days: DayAttendance[];
  employeeIndex?: number;
  onAdjustmentClick?: (date: number) => void;
}

export const AttendanceGrid: React.FC<AttendanceGridProps> = ({
  days,
  employeeIndex,
  onAdjustmentClick,
}) => {
  const getStatusColor = (status: string, day?: DayAttendance) => {
    const s = status.toUpperCase();

    // Adjustment colors
    if (s === 'ADJ-P')
      return 'bg-lime-100 text-lime-800 border-lime-300 ring-2 ring-lime-400';
    if (s === 'ADJ-M/WO-I')
      return 'bg-orange-200 text-orange-800 border-orange-300 ring-2 ring-orange-400';

    // Original colors
    if (s === 'P') return 'bg-green-100 text-green-800 border-green-300';
    if (s === 'A') return 'bg-red-100 text-red-800 border-red-300';
    if (s === 'WO') return 'bg-gray-100 text-gray-800 border-gray-300';
    if (s === 'H') return 'bg-blue-100 text-blue-800 border-blue-300';
    if (s === 'OD') return 'bg-purple-100 text-purple-800 border-purple-300';
    if (s === 'LEAVE') return 'bg-yellow-100 text-yellow-800 border-yellow-300';

    return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {days.map((day, index) => (
        <div
          key={index}
          className={`border-2 rounded-lg p-4 cursor-pointer transition-all hover:shadow-lg ${getStatusColor(
            day.attendance.status,
            day
          )} ${day.isAdjustmentOriginal || day.isAdjustmentTarget ? 'relative' : ''}`}
          onClick={() => onAdjustmentClick?.(day.date)}
        >
          {/* Adjustment Badge */}
          {day.isAdjustmentOriginal && (
            <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              ✓
            </div>
          )}
          {day.isAdjustmentTarget && (
            <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              ✓
            </div>
          )}

          {/* Day Header */}
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-current border-opacity-30">
            <span className="text-lg font-bold">{day.date}</span>
            <span className="text-sm font-semibold">{day.day}</span>
          </div>

          {/* Attendance Details */}
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

            {/* Show original status if adjusted */}
            {day.originalStatus && (
              <div className="flex justify-between pt-2 border-t border-current border-opacity-30 text-xs opacity-70">
                <span className="font-semibold">Original:</span>
                <span>{day.originalStatus}</span>
              </div>
            )}

            
          </div>
        </div>
      ))}
    </div>
  );
};
