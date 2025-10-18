// components/FileUploader.tsx
"use client";

import React, { useRef } from "react";
import { useExcel } from "@/context/ExcelContext";
import { processExcelFile } from "@/lib/excelProcessor";
import { exportToExcel } from "@/lib/excelExporter";

export const FileUploader: React.FC = () => {
  const { excelData, setExcelData, clearData, isLoading, setIsLoading } = useExcel();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    if (
      !validTypes.includes(file.type) &&
      !file.name.endsWith(".xls") &&
      !file.name.endsWith(".xlsx")
    ) {
      alert("Please upload a valid Excel file (.xls or .xlsx)");
      return;
    }

    setIsLoading(true);

    try {
      const processedData = await processExcelFile(file);
      console.log('Processed employees:', processedData.employees.length);
      setExcelData(processedData);
    } catch (error) {
      console.error("Error processing file:", error);
      alert(
        "Error processing the Excel file. Please ensure it's in the correct format."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    clearData();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleExport = async () => {
    if (!excelData) return;

    setIsLoading(true);
    try {
      await exportToExcel(excelData);
    } catch (error) {
      console.error("Error exporting file:", error);
      alert("Error exporting the Excel file. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">
        Excel Layout Improver
      </h2>
      <p className="text-gray-600 mb-6">
        Upload your employee performance register to view attendance data in an
        improved, more readable format.
      </p>

      <div className="flex gap-4 items-center">
        <label className="flex-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            onChange={handleFileUpload}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100
              cursor-pointer"
            disabled={isLoading}
          />
        </label>

        <button
          onClick={handleExport}
          className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          disabled={isLoading || !excelData}>
          Export
        </button>

        <button
          onClick={handleClear}
          className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          disabled={isLoading}>
          Clear
        </button>
      </div>

      {isLoading && (
        <div className="mt-4 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
          <span className="ml-3 text-gray-600">Processing file...</span>
        </div>
      )}

      {excelData && !isLoading && (
        <div className="mt-4 p-4 bg-green-50 rounded-md border border-green-200">
          <p className="text-green-800 text-sm">
            ✓ File processed successfully! {excelData.employees.length}{" "}
            employees found. Click <strong>Export</strong> to download the
            improved layout.
          </p>
        </div>
      )}
    </div>
  );
};
