// app/page.tsx
'use client';

import React, { useState } from 'react';
import { FileUploader } from '@/components/FileUploader';
import { EmployeeCard } from '@/components/EmployeeCard';
import { BulkAdjustmentDayModal } from '@/components/BulkAdjustmentDayModal';
import { HolidayManagementModal } from '@/components/HolidayManagementModal';
import { useExcel } from '@/context/ExcelContext';
import { EmployeeData } from '@/lib/types';

export default function Home() {
  const { excelData } = useExcel();
  const [isBulkAdjustmentOpen, setIsBulkAdjustmentOpen] = useState(false);
  const [isHolidayManagementOpen, setIsHolidayManagementOpen] = useState(false);

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <FileUploader />

        {excelData && (
          <div className="mt-8">
            {/* Header */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-3xl font-bold text-gray-800 mb-2">
                    {excelData.title}
                  </h1>
                  <p className="text-gray-600">{excelData.period}</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Total Employees: {excelData.employees.length}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 ml-4">
                  <button
                    onClick={() => setIsHolidayManagementOpen(true)}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-md hover:from-blue-600 hover:to-indigo-700 transition-all text-sm font-semibold whitespace-nowrap shadow-md hover:shadow-lg flex items-center gap-2"
                  >
                    <span>🎉</span>
                    Holiday Management
                  </button>
                  <button
                    onClick={() => setIsBulkAdjustmentOpen(true)}
                    className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-md hover:from-orange-600 hover:to-red-600 transition-all text-sm font-semibold whitespace-nowrap shadow-md hover:shadow-lg flex items-center gap-2"
                  >
                    <span>📅</span>
                    Bulk Adjustment
                  </button>
                </div>
              </div>
            </div>

            {/* Employee Cards */}
            <div className="space-y-4">
              {excelData.employees.map((employee: EmployeeData, index: number) => (
                <EmployeeCard
                  key={employee.empCode}
                  employee={employee}
                  index={index}
                />
              ))}
            </div>
          </div>
        )}

        {!excelData && (
          <div className="mt-12 text-center text-gray-500">
            <p className="text-lg">Upload an Excel file to get started</p>
          </div>
        )}

        {/* Modals */}
        {excelData && (
          <>
            <BulkAdjustmentDayModal
              employees={excelData.employees}
              isOpen={isBulkAdjustmentOpen}
              onClose={() => setIsBulkAdjustmentOpen(false)}
            />
            <HolidayManagementModal
              employees={excelData.employees}
              isOpen={isHolidayManagementOpen}
              onClose={() => setIsHolidayManagementOpen(false)}
            />
          </>
        )}
      </div>
    </main>
  );
}