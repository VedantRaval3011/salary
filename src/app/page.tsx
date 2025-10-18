'use client';

import { FileUploader } from '@/components/FileUploader';
import { EmployeeCard } from '@/components/EmployeeCard';
import { useExcel } from '@/context/ExcelContext';
import { EmployeeData } from '@/lib/types';

export default function Home() {
  const { excelData } = useExcel();

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <FileUploader />

        {excelData && (
          <div className="mt-8">
            {/* Header */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h1 className="text-3xl font-bold text-gray-800 mb-2">{excelData.title}</h1>
              <p className="text-gray-600">{excelData.period}</p>
              <p className="text-sm text-gray-500 mt-2">
                Total Employees: {excelData.employees.length}
              </p>
            </div>

            {/* Employee Cards */}
            <div className="space-y-4">
              {excelData.employees.map((employee: EmployeeData, index: number) => (
                <EmployeeCard key={employee.empCode} employee={employee} index={index} />
              ))}
            </div>
          </div>
        )}

        {!excelData && (
          <div className="mt-12 text-center text-gray-500">
            <p className="text-lg">Upload an Excel file to get started</p>
          </div>
        )}
      </div>
    </main>
  );
}
