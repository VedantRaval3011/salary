"use client";

import React, { useRef, useState } from "react";
import { useExcel } from "@/context/ExcelContext";
import { processExcelFile } from "@/lib/excelProcessor";
import { processPaidLeaveFile } from "@/lib/processPaidLeave";
import { exportToExcel } from "@/lib/excelExporter";
import { REQUIRED_FILES, OPTIONAL_FILES } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

/**
 * =========================
 * Helpers
 * =========================
 */

const norm = (s: any) => String(s ?? "").toLowerCase().trim();

/** EXACT match for our Paid Leave sheet (but forgiving about spaces/case). */
const isExactPaidLeaveFilename = (nameOrFile: string | File) => {
  const n = typeof nameOrFile === "string" ? nameOrFile : nameOrFile.name;
  const x = norm(n);
  // normalize dots and spaces
  const collapsed = x.replace(/\s+/g, " ");
  // accept with or without the ".xlsx" suffix and with optional leading '07.' prefix
  return (
    /^0*7\.\s*staff\s*paid\s*leave\s*sheet(\.xlsx)?$/i.test(n) ||
    /(^|\/)0*7\.\s*staff\s*paid\s*leave\s*sheet(\.xlsx)?$/i.test(n) ||
    /(^|\/)\s*staff\s*paid\s*leave\s*sheet(\.xlsx)?$/i.test(n) && collapsed.includes("07. staff paid leave sheet")
  );
};

/** Categorize by filename. The only Paid Leave category is our exact sheet. */
const guessCategoryFromFilename = (fileName: string): string => {
  const n = norm(fileName);

  // === Main required attendance (map to your exact REQUIRED_FILES[0]) ===
  // match common “Monthly Attendance Tulsi …”
  if (/\bmonthly\b/.test(n) && /\battendance\b/.test(n) && /\btulsi\b/.test(n)) {
    return REQUIRED_FILES[0]; // "Monthly Attendance Tulsi Sheet"
  }
  if (/\battendance\b/.test(n) && /\btulsi\b/.test(n)) {
    return REQUIRED_FILES[0];
  }
  if (/\btulsi\b/.test(n) && /\bsheet\b/.test(n)) {
    return REQUIRED_FILES[0];
  }

  // === Paid Leave: only this file is PL ===
  if (isExactPaidLeaveFilename(fileName)) return "Staff Paid Leave Sheet";

  // Other optionals (optional)
  if (/\bmonthwise\s*salary\b/.test(n)) return "Monthwise Salary";
  if (/\bmisc\b/.test(n)) return "MISC";
  if (/\bstaff\s*tulsi\b/.test(n)) return "Staff Tulsi";
  if (/\bworker\s*tulsi\b/.test(n)) return "Worker Tulsi";

  return fileName; // fallback label
};

/** Is the selected category treated as paid leave? */
const isPaidLeaveCategory = (name: string) =>
  norm(name) === "staff paid leave sheet";

export const FileUploader: React.FC = () => {
  const {
    excelData,
    setExcelData,
    clearData,
    isLoading,
    setIsLoading,
    addUploadedFile,
    removeUploadedFile,
    updateFileStatus,
    updateFileData,
    updatePaidLeaveData,
    getAllUploadedFiles,
    clearAllFiles,
    mergePaidLeaveData,
  } = useExcel();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileType, setSelectedFileType] = useState<string>(REQUIRED_FILES[0]);
  const [processingCount, setProcessingCount] = useState(0);

  const remergeAllPaidLeaveIfAny = () => {
    if (!excelData) return;
    const plFiles = getAllUploadedFiles().filter(
      (f) =>
        f.status === "success" &&
        Array.isArray(f.paidLeaveData) &&
        f.paidLeaveData.length > 0
    );
    plFiles.forEach((f) => mergePaidLeaveData(f.paidLeaveData!));
  };

  /**
   * =========================
   * Multiple file upload
   * =========================
   */
  const handleMultipleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setIsLoading(true);
    setProcessingCount(fileArray.length);

    const uploadPromises = fileArray.map(async (file) => {
      const fileId = uuidv4();

      // Derive category from filename (not by position)
      const guessedCategory = guessCategoryFromFilename(file.name);
      const isRequired = guessedCategory === REQUIRED_FILES[0];
      const categoryName = isRequired ? REQUIRED_FILES[0] : guessedCategory;

      const uploadedFile = {
        id: fileId,
        fileName: file.name,
        fileType: isRequired ? ("required" as const) : ("optional" as const),
        uploadedAt: new Date().toISOString(),
        data: null,
        status: "processing" as const,
        categoryName,
      };

      addUploadedFile(uploadedFile as any);

      try {
        const treatAsPaidLeave =
          isPaidLeaveCategory(categoryName) || isExactPaidLeaveFilename(file);

        if (treatAsPaidLeave) {
          // Robust parser; never throws to UI
          const paidLeaveData = await processPaidLeaveFile(file);
          updatePaidLeaveData(fileId, paidLeaveData);

          if (excelData && paidLeaveData.length > 0) {
            mergePaidLeaveData(paidLeaveData);
          }

          // mark success if we reached here
          updateFileStatus(fileId, "success");
          return { success: true, fileId, fileName: file.name, type: "paidLeave" as const };
        } else {
          const processedData = await processExcelFile(file);
          updateFileData(fileId, processedData);

          if (isRequired) {
            setExcelData(processedData);
            remergeAllPaidLeaveIfAny();
          }

          updateFileStatus(fileId, "success");
          return { success: true, fileId, fileName: file.name, type: "attendance" as const };
        }
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        // Soft-fail: mark as error but do not crash
        updateFileStatus(
          fileId,
          "error",
          error instanceof Error ? error.message : "Unknown error"
        );
        return { success: false, fileId, fileName: file.name, error };
      }
    });

    const results = await Promise.allSettled(uploadPromises);
    const successCount = results.filter(
      (r) => r.status === "fulfilled" && (r.value as any).success
    ).length;
    const failCount = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && !(r.value as any).success)
    ).length;

    setIsLoading(false);
    setProcessingCount(0);

    if (successCount > 0 && failCount === 0) {
      alert(`✓ All ${successCount} file(s) uploaded successfully!`);
    } else if (successCount > 0 && failCount > 0) {
      alert(`⚠️ ${successCount} file(s) uploaded successfully, ${failCount} failed.`);
    } else {
      alert(`✕ All ${failCount} file(s) failed to upload.`);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /**
   * =========================
   * Single file upload
   * =========================
   */
  const handleSingleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileId = uuidv4();

    // Prefer user selection; if not, guess
    const guessedCategory = guessCategoryFromFilename(file.name);
    const categoryName = selectedFileType || guessedCategory;
    const isRequired = REQUIRED_FILES.includes(categoryName as (typeof REQUIRED_FILES)[number]);

    const uploadedFile = {
      id: fileId,
      fileName: file.name,
      fileType: isRequired ? ("required" as const) : ("optional" as const),
      uploadedAt: new Date().toISOString(),
      data: null,
      status: "processing" as const,
      categoryName,
    };

    addUploadedFile(uploadedFile as any);
    setIsLoading(true);

    try {
      const treatAsPaidLeave =
        isPaidLeaveCategory(categoryName) || isExactPaidLeaveFilename(file);

      if (treatAsPaidLeave) {
        const paidLeaveData = await processPaidLeaveFile(file);
        updatePaidLeaveData(fileId, paidLeaveData);

        if (excelData && paidLeaveData.length > 0) {
          mergePaidLeaveData(paidLeaveData);
        }

        updateFileStatus(fileId, "success");
        alert(`✓ Paid Leave file uploaded. ${paidLeaveData.length} PL rows processed.`);
      } else {
        const processedData = await processExcelFile(file);
        updateFileData(fileId, processedData);

        if (isRequired) {
          setExcelData(processedData);
          remergeAllPaidLeaveIfAny();
        }

        updateFileStatus(fileId, "success");
        alert(`✓ File uploaded successfully!`);
      }
    } catch (error) {
      console.error("Error processing file:", error);
      updateFileStatus(
        fileId,
        "error",
        error instanceof Error ? error.message : "Unknown error"
      );
      alert("Error processing the file. It was uploaded but may contain errors.");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClear = () => {
    clearData();
    clearAllFiles();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveFile = (fileId: string) => {
    removeUploadedFile(fileId);
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

  const uploadedFiles = getAllUploadedFiles();
  const requiredFilesUploaded = REQUIRED_FILES.every((fileName) =>
    uploadedFiles.some((f) => f.categoryName === fileName && f.status === "success")
  );

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-2 text-gray-800">Excel File Manager</h2>
      <p className="text-gray-600 mb-6">
        Upload multiple Excel files at once or one at a time to manage attendance data.
      </p>

      {/* Multiple File Upload Section */}
      <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-300">
        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <span className="text-blue-600">📤</span>
          Bulk Upload (Multiple Files at Once)
        </h3>
        <label className="block">
          <input
            type="file"
            accept=".xls,.xlsx"
            multiple
            onChange={handleMultipleFileUpload}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-600 file:text-white
              hover:file:bg-blue-700
              cursor-pointer"
            disabled={isLoading}
          />
        </label>
        <p className="text-xs text-gray-600 mt-2">
          ℹ️ The Paid Leave source is only: “07. Staff Paid Leave Sheet.xlsx”.
        </p>
      </div>

      {/* Single File Upload Section */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <span className="text-green-600">📁</span>
          Single File Upload (With Category Selection)
        </h3>

        {/* File Category Selection */}
        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-600 mb-2">
            Select File Category
          </label>
          <select
            value={selectedFileType}
            onChange={(e) => setSelectedFileType(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            disabled={isLoading}
          >
            <optgroup label="Required Files">
              {REQUIRED_FILES.map((file) => (
                <option key={file} value={file}>
                  {file} (Required)
                </option>
              ))}
            </optgroup>
            <optgroup label="Optional Files">
              {OPTIONAL_FILES.map((file) => (
                <option key={file} value={file}>
                  {file} (Optional)
                </option>
              ))}
            </optgroup>
            <option value="Staff Paid Leave Sheet">Staff Paid Leave Sheet (Optional)</option>
          </select>
        </div>

        <label className="block">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            onChange={handleSingleFileUpload}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-green-50 file:text-green-700
              hover:file:bg-green-100
              cursor-pointer"
            disabled={isLoading}
          />
        </label>
        <p className="text-xs text-gray-600 mt-2">
          ℹ️ Paid Leave values are read only from “07. Staff Paid Leave Sheet.xlsx”.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 items-center mb-6">
        <button
          onClick={handleExport}
          className="flex-1 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
          disabled={isLoading || !excelData}
        >
          Export Main File
        </button>

        <button
          onClick={handleClear}
          className="flex-1 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
          disabled={isLoading}
        >
          Clear All
        </button>
      </div>

      {isLoading && (
        <div className="mt-4 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
          <span className="ml-3 text-gray-600">
            Processing {processingCount > 0 ? `${processingCount} file(s)` : "file"}...
          </span>
        </div>
      )}

      {/* Uploaded Files List */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Uploaded Files ({uploadedFiles.length})
        </h3>

        {uploadedFiles.length === 0 ? (
          <p className="text-gray-500 text-sm">No files uploaded yet.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className={`p-4 rounded-lg border-2 flex justify-between items-center ${
                  file.status === "success"
                    ? "bg-green-50 border-green-300"
                    : file.status === "error"
                    ? "bg-red-50 border-red-300"
                    : "bg-yellow-50 border-yellow-300"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800">{file.categoryName}</p>
                    <span
                      className={`px-2 py-1 text-xs rounded-full font-semibold ${
                        file.fileType === "required"
                          ? "bg-red-200 text-red-800"
                          : "bg-blue-200 text-blue-800"
                      }`}
                    >
                      {file.fileType.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {file.fileName}{" "}
                    {file.status === "success" && file.data && (
                      <span className="text-green-600 font-semibold">
                        ({file.data.employees.length} employees)
                      </span>
                    )}
                    {file.status === "success" &&
                      Array.isArray(file.paidLeaveData) && (
                        <span className="ml-2 text-indigo-600 font-semibold">
                          ({file.paidLeaveData.length} PL rows)
                        </span>
                      )}
                  </p>
                  {file.error && (
                    <p className="text-sm text-red-600 mt-1">Error: {file.error}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Uploaded: {new Date(file.uploadedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-3 ml-4">
                  {file.status === "processing" && (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-700"></div>
                  )}
                  {file.status === "success" && (
                    <span className="text-green-600 text-2xl">✓</span>
                  )}
                  {file.status === "error" && (
                    <span className="text-red-600 text-2xl">✕</span>
                  )}

                  <button
                    onClick={() => handleRemoveFile(file.id)}
                    className="px-3 py-1 bg-red-500 text-white text-sm rounded-md hover:bg-red-600 transition-colors disabled:bg-gray-400"
                    disabled={isLoading}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status Summary */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-gray-700">
          <strong>Files Progress:</strong>{" "}
          {uploadedFiles.filter((f) => f.status === "success").length}/{uploadedFiles.length} uploaded successfully
        </p>
        {REQUIRED_FILES.length > 0 && (
          <p className="text-sm text-gray-700 mt-2">
            <strong>Required Files:</strong>{" "}
            {requiredFilesUploaded ? (
              <span className="text-green-600 font-semibold">✓ All required files uploaded</span>
            ) : (
              <span className="text-red-600 font-semibold">✕ Please upload required file(s)</span>
            )}
          </p>
        )}
        <p className="text-xs text-gray-600 mt-3">
          💡 <strong>Tip:</strong> Paid Leave is read only from “07. Staff Paid Leave Sheet.xlsx”.
        </p>
      </div>
    </div>
  );
};
