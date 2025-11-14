"use client";

import React from "react";
import { useAttendanceStore } from "@/store/attendanceStore";

const minutesToHHMM = (totalMinutes: number): string => {
  if (isNaN(totalMinutes) || totalMinutes === 0) return "0:00";
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = Math.round(absMinutes % 60);
  const sign = totalMinutes < 0 ? "-" : "";
  return `${sign}${hours}:${minutes.toString().padStart(2, "0")}`;
};

export const EmployeeStoreDisplay: React.FC = () => {
  const stats = useAttendanceStore((state) => state.stats);

  if (!stats) {
    return (
      <div className="mt-6 p-6 bg-yellow-50 rounded-lg border-2 border-yellow-300">
        <div className="flex items-center gap-3">
          <span className="text-3xl">⚠️</span>
          <div>
            <h3 className="text-lg font-bold text-yellow-900">No Data Loaded</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Navigate to an employee's detail page to populate the store
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 p-6 bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 rounded-lg border-2 border-purple-300 shadow-xl">
      <h3 className="text-xl font-bold text-purple-900 mb-4 flex items-center gap-2">
        <span className="text-2xl">📊</span>
        Current Employee Attendance Store
      </h3>

      {/* Employee Info */}
      <div className="mb-6 p-4 bg-white rounded-lg border-2 border-purple-200">
        <div className="flex items-center gap-2">
          <span className="text-2xl">👤</span>
          <div>
            <h4 className="text-lg font-bold text-gray-800">{stats.empName}</h4>
            <p className="text-sm text-gray-600">Code: {stats.empCode}</p>
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Grand Total Present Day */}
        <div className="bg-green-50 p-4 rounded-lg border-2 border-green-300">
          <div className="text-xs font-semibold text-green-700 mb-1">
            📅 Grand Total Present Days
          </div>
          <div className="text-3xl font-bold text-green-800">
            {stats.grandTotalPresentDay.toFixed(1)}
          </div>
          <div className="text-xs text-green-600 mt-1">days</div>
        </div>

        {/* Grand Total OT */}
        <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-300">
          <div className="text-xs font-semibold text-blue-700 mb-1">
            ⏰ Grand Total OT
          </div>
          <div className="text-3xl font-bold text-blue-800">
            {minutesToHHMM(stats.grandTotalOT)}
          </div>
          <div className="text-xs text-blue-600 mt-1">
            ({stats.grandTotalOT} mins)
          </div>
        </div>

        {/* Total Late/Early */}
        <div className="bg-orange-50 p-4 rounded-lg border-2 border-orange-300">
          <div className="text-xs font-semibold text-orange-700 mb-1">
            🏃 Total Late/Early Departure
          </div>
          <div className="text-3xl font-bold text-orange-800">
            {minutesToHHMM(stats.totalLateEarlyDeparture)}
          </div>
          <div className="text-xs text-orange-600 mt-1">
            ({stats.totalLateEarlyDeparture} mins)
          </div>
        </div>

        {/* Final Difference */}
        <div
          className={`p-4 rounded-lg border-2 ${
            stats.finalDifference >= 0
              ? "bg-green-100 border-green-400"
              : "bg-red-100 border-red-400"
          }`}
        >
          <div
            className={`text-xs font-semibold mb-1 ${
              stats.finalDifference >= 0 ? "text-green-700" : "text-red-700"
            }`}
          >
            🎯 Final Difference
          </div>
          <div
            className={`text-3xl font-bold ${
              stats.finalDifference >= 0 ? "text-green-800" : "text-red-800"
            }`}
          >
            {stats.finalDifference >= 0 ? "+" : ""}
            {minutesToHHMM(Math.abs(stats.finalDifference))}
          </div>
          <div
            className={`text-xs mt-1 ${
              stats.finalDifference >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            ({stats.finalDifference >= 0 ? "+" : ""}
            {stats.finalDifference.toFixed(1)} mins)
          </div>
          <div
            className={`text-[10px] font-semibold mt-2 py-1 px-2 rounded-full text-center ${
              stats.finalDifference >= 0
                ? "bg-green-200 text-green-900"
                : "bg-red-200 text-red-900"
            }`}
          >
            {stats.finalDifference >= 0 ? "✓ Net OT Gain" : "✗ Net Deduction"}
          </div>
        </div>
      </div>

      {/* Calculation Formula */}
      <div className="bg-white p-4 rounded-lg border-2 border-purple-200">
        <h5 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <span>🧮</span>
          Calculation Formula
        </h5>
        <div className="flex items-center justify-center gap-3 text-sm flex-wrap">
          <div className="bg-blue-100 px-3 py-2 rounded-lg font-bold text-blue-800">
            {minutesToHHMM(stats.grandTotalOT)}
          </div>
          <span className="text-gray-600 font-semibold">−</span>
          <div className="bg-orange-100 px-3 py-2 rounded-lg font-bold text-orange-800">
            {minutesToHHMM(stats.totalLateEarlyDeparture)}
          </div>
          <span className="text-gray-600 font-semibold">=</span>
          <div
            className={`px-3 py-2 rounded-lg font-bold ${
              stats.finalDifference >= 0
                ? "bg-green-200 text-green-900"
                : "bg-red-200 text-red-900"
            }`}
          >
            {stats.finalDifference >= 0 ? "+" : ""}
            {minutesToHHMM(Math.abs(stats.finalDifference))}
          </div>
        </div>
        <div className="text-center text-xs text-gray-600 mt-3">
          Grand Total OT − Total Late/Early Departure = Final Difference
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <h5 className="text-xs font-semibold text-blue-800 mb-2">
          ℹ️ How it works:
        </h5>
        <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
          <li>Store is updated automatically when viewing employee details</li>
          <li>All three components contribute their final values to the store</li>
          <li>Final Difference = OT earned minus Late/Early deductions</li>
          <li>Positive = More OT earned | Negative = More deductions</li>
        </ul>
      </div>
    </div>
  );
};