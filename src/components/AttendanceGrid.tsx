// components/AttendanceGrid.tsx
"use client";

import React from "react";
import { DayAttendance } from "@/lib/types";

interface AttendanceGridProps {
  days: DayAttendance[];
  employeeIndex?: number;
  onAdjustmentClick?: (date: number) => void;
  customTime?: string; // e.g., "9:00 TO 6:00"
  isOTGranted?: boolean;
}

export const AttendanceGrid: React.FC<AttendanceGridProps> = ({
  days,
  employeeIndex,
  onAdjustmentClick,
  customTime,
  isOTGranted,
}) => {
  // Parse custom timing to get start and end times
  const parseCustomTime = (timeStr: string | undefined) => {
    if (!timeStr) return null;

    // Match patterns like "9:00 TO 6:00", "08:30 TO 17:30", etc.
    const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*TO\s*(\d{1,2})(?::(\d{2}))?/i);
    if (!match) return null;

    let startHour = parseInt(match[1]);
    const startMin = parseInt(match[2]);
    let endHour = parseInt(match[3]);
    const endMin = parseInt(match[4]);

    // Convert to 24-hour format if end is earlier (e.g. 9→6 should mean 18:00)
    if (endHour < startHour) {
      endHour += 12;
    }

    // Handle “morning” shifts like 8:30–17:30 (military style)
    if (endHour <= 12 && startHour < 8) {
      endHour += 12;
    }

    return { startHour, startMin, endHour, endMin };
  };

  // Convert time string (HH:MM) to minutes since midnight
  const timeToMinutes = (timeStr: string): number => {
    if (!timeStr || timeStr === "-") return 0;
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + (minutes || 0);
  };

  const recalculateOTHours = (
    inTime: string,
    outTime: string,
    customTiming: ReturnType<typeof parseCustomTime>
  ): string => {
    if (
      !customTiming ||
      !inTime ||
      !outTime ||
      inTime === "-" ||
      outTime === "-"
    )
      return "0:00";

    const timeToMinutes = (t: string): number => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + (m || 0);
    };

    const outMinutes = timeToMinutes(outTime);
    const expectedEndMinutes = customTiming.endHour * 60 + customTiming.endMin;

    const otMinutes =
      outMinutes > expectedEndMinutes ? outMinutes - expectedEndMinutes : 0;
    if (otMinutes < 5) return "0:00"; // ignore minor deviations

    const hrs = Math.floor(otMinutes / 60);
    const mins = otMinutes % 60;
    return `${hrs}:${mins.toString().padStart(2, "0")}`;
  };

  // Recalculate late minutes for custom timing (9:00 start)
  const recalculateLateMinutes = (
    inTime: string,
    customTiming: ReturnType<typeof parseCustomTime>
  ): number => {
    if (!customTiming || !inTime || inTime === "-") return 0;

    const inMinutes = timeToMinutes(inTime);
    const expectedStartMinutes =
      customTiming.startHour * 60 + customTiming.startMin;

    const lateMins = inMinutes - expectedStartMinutes;
    return lateMins > 0 ? lateMins : 0;
  };

  const customTiming = parseCustomTime(customTime);

// Process days with recalculated values (apply for P and ADJ-P)
const processedDays = days.map((day) => {
  const status = (day.attendance.status || "").toUpperCase();

  // Apply custom time recalculation for P and ADJ-P
  if (!customTiming || (status !== "P" && status !== "ADJ-P")) {
    return day;
  }


    // Store original values as strings to keep types consistent
    const originalLateMins = String(day.attendance.lateMins ?? "");
    const originalOTHrs = String(day.attendance.otHrs ?? "");

    // Only recalculate Late Mins, keep OT as-is from Excel
    const recalculatedLateMins = recalculateLateMinutes(
      day.attendance.inTime,
      customTiming
    );

    const recalculatedOTHrs = recalculateOTHours(
      day.attendance.inTime,
      day.attendance.outTime,
      customTiming
    );

    const updated = {
      ...day,
      attendance: {
        ...day.attendance,
        lateMins: recalculatedLateMins.toString(),
        // OT Hours remains unchanged from original Excel data
        otHrs: recalculatedOTHrs,
      },
      originalLateMins,
      originalOTHrs,
      hasCustomCalculation: true,
    };

    return updated as DayAttendance & {
      originalLateMins?: string;
      originalOTHrs?: string;
      hasCustomCalculation?: boolean;
    };
  });

  const getStatusColor = (status: string, day?: DayAttendance) => {
    const s = status.toUpperCase();

    // Adjustment colors
    if (s === "ADJ-P")
      return "bg-lime-100 text-lime-800 border-lime-300 ring-2 ring-lime-400";
    if (s === "ADJ-M/WO-I")
      return "bg-orange-200 text-orange-800 border-orange-300 ring-2 ring-orange-400";

    // Original colors
    if (s === "P") return "bg-green-100 text-green-800 border-green-300";
    if (s === "A") return "bg-red-100 text-red-800 border-red-300";
    if (s === "WO") return "bg-gray-100 text-gray-800 border-gray-300";
    if (s === "H") return "bg-blue-100 text-blue-800 border-blue-300";
    if (s === "OD") return "bg-purple-100 text-purple-800 border-purple-300";
    if (s === "LEAVE") return "bg-yellow-100 text-yellow-800 border-yellow-300";

    return "bg-yellow-100 text-yellow-800 border-yellow-300";
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {processedDays.map((day, index) => (
        <div
          key={index}
          className={`border-2 rounded-lg p-4 cursor-pointer transition-all hover:shadow-lg ${getStatusColor(
            day.attendance.status,
            day
          )} ${
            day.isAdjustmentOriginal || day.isAdjustmentTarget ? "relative" : ""
          }`}
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

          {/* Custom Timing Badge */}
          {customTiming && day.hasCustomCalculation && (
            <div
              className="absolute -top-2 -left-2 bg-purple-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center"
              title="Custom Timing Applied"
            >
              🕐
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
              <span>{day.attendance.shift || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">In Time:</span>
              <span>{day.attendance.inTime || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Out Time:</span>
              <span>{day.attendance.outTime || "-"}</span>
            </div>

            {/* Late Mins - Show both original and new if recalculated */}
            <div className="flex justify-between">
              <span className="font-semibold">Late Mins:</span>
              <span
                className={
                  day.hasCustomCalculation ? "font-bold text-purple-700" : ""
                }
              >
                {day.attendance.lateMins || "0"}
                {day.hasCustomCalculation && " *"}
              </span>
            </div>
            {day.hasCustomCalculation &&
              day.originalLateMins !== day.attendance.lateMins && (
                <div className="flex justify-between text-xs opacity-60 -mt-1 ml-4">
                  <span>Prev Late:</span>
                  <span className="line-through">
                    {day.originalLateMins || "0"}
                  </span>
                </div>
              )}

            <div className="flex justify-between">
              <span className="font-semibold">Early Dep:</span>
              <span>{day.attendance.earlyDep || "0"}</span>
            </div>

            {/* OT Hours - Display original value with indicator */}
            <div className="flex justify-between">
              <span className="font-semibold">OT Hours:</span>
              <span
                className={
                  day.hasCustomCalculation ? "font-bold text-purple-700" : ""
                }
              >
                {day.attendance.otHrs || "0:00"}
                {day.hasCustomCalculation && " *"}
              </span>
            </div>
            {day.hasCustomCalculation && day.originalOTHrs && (
              <div className="flex justify-between text-xs opacity-60 -mt-1 ml-4">
                <span>Prev OT:</span>
                <span className="line-through">
                  {day.originalOTHrs || "0:00"}
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="font-semibold">Work Hours:</span>
              <span className="font-bold">
                {day.attendance.workHrs || "0:00"}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-current border-opacity-30">
              <span className="font-semibold">Status:</span>
              <span className="font-bold text-lg">
                {day.attendance.status || "-"}
              </span>
            </div>

            {/* Show original status if adjusted */}
            {day.originalStatus && (
              <div className="flex justify-between pt-2 border-t border-current border-opacity-30 text-xs opacity-70">
                <span className="font-semibold">Original:</span>
                <span>{day.originalStatus}</span>
              </div>
            )}

            {/* Custom timing notice */}
            {day.hasCustomCalculation && (
              <div className="pt-2 border-t border-current border-opacity-30 text-xs text-purple-700">
                * Recalculated for {customTime}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
