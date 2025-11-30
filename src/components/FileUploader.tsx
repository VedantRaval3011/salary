"use client";

import React, { useCallback, useRef, useState } from "react";
import { useExcel } from "@/context/ExcelContext";
import { processExcelFile } from "@/lib/excelProcessor";
import { processPaidLeaveFile } from "@/lib/processPaidLeave";
import { exportToExcel } from "@/lib/excelExporter";
import { REQUIRED_FILES, OPTIONAL_FILES } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { processOTSheet } from "@/lib/processOTSheets";
import { processLunchInOutFile } from "@/lib/processLunchInOut";
import { processHRFile } from "@/lib/processHRFile";
import { PresentDayComparison } from "@/components/PresentDayComparison"; // Restored alias path
import { OTComparison } from "./OTComparison";
import { useAttendanceStore } from "@/store/attendanceStore";
import { EmployeeStoreDisplay } from "./EmployeeStoreDisplay";
import { LateComparison } from "./LateComparison";
import { UnifiedComparison } from "./UnifiedComparison";

const norm = (s: any) =>
  String(s ?? "")
    .toLowerCase()
    .trim();

const isExactPaidLeaveFilename = (nameOrFile: string | File) => {
  const n = typeof nameOrFile === "string" ? nameOrFile : nameOrFile.name;
  const x = norm(n);
  const collapsed = x.replace(/\s+/g, " ");
  return (
    /^0*7\.\s*staff\s*paid\s*leave\s*sheet(\.xlsx)?$/i.test(n) ||
    /(^|\/)0*7\.\s*staff\s*paid\s*leave\s*sheet(\.xlsx)?$/i.test(n) ||
    (/(^|\/)\s*staff\s*paid\s*leave\s*sheet(\.xlsx)?$/i.test(n) &&
      collapsed.includes("07. staff paid leave sheet"))
  );
};

const guessCategoryFromFilename = (fileName: string): string => {
  const n = norm(fileName);

  if (
    /\bmonthly\b/.test(n) &&
    /\battendance\b/.test(n) &&
    /\btulsi\b/.test(n)
  ) {
    return REQUIRED_FILES[0];
  }
  if (/\battendance\b/.test(n) && /\btulsi\b/.test(n)) {
    return REQUIRED_FILES[0];
  }
  if (/\btulsi\b/.test(n) && /\bsheet\b/.test(n)) {
    return REQUIRED_FILES[0];
  }

  if (/\bstaff\s*ot\s*granted\b/.test(n) || /\b06\.\s*staff\s*ot\b/.test(n)) {
    return "Staff OT Granted";
  }
  if (/\bfull\s*night\s*stay\b/.test(n) || /\b05\.\s*full\s*night\b/.test(n)) {
    return "Full Night Stay Emp OT Sheet";
  }
  if (/\b09\s*to\s*06\b/.test(n) || /\b08\.\s*09\s*to\s*06\b/.test(n)) {
    return "09 to 06 Time Granted Emp Sheet";
  }
  if (/\blunch\b/.test(n) && (/\bin\b/.test(n) || /\bout\b/.test(n))) {
    return "Lunch In Out Time Sheet";
  }
  if (/\b04\.\s*lunch\b/.test(n)) {
    return "Lunch In Out Time Sheet";
  }

  if (/\bmaintenance\b/.test(n) && /\bdeduct\b/.test(n)) {
    return "Maintenance OT Deduct";
  }
  if (/\b10\.\s*maintenance\b/.test(n)) {
    return "Maintenance OT Deduct";
  }

  if (isExactPaidLeaveFilename(fileName)) return "Staff Paid Leave Sheet";

  if (/\bmonthwise\s*salary\b/.test(n)) return "Monthwise Salary";
  if (/\bmisc\b/.test(n)) return "MISC";
  if (/\bstaff\s*tulsi\b/.test(n)) return "Staff Tulsi";
  if (/\bworker\s*tulsi\b/.test(n)) return "Worker Tulsi";

  return fileName;
};

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
    updateHRData,
    getAllUploadedFiles,
    clearAllFiles,
    mergePaidLeaveData,
  } = useExcel();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileType, setSelectedFileType] = useState<string>(
    REQUIRED_FILES[0]
  );
  const [processingCount, setProcessingCount] = useState(0);
  const [showOTComparison, setShowOTComparison] = useState(false);
  const [employeeFinalDifferences, setEmployeeFinalDifferences] = useState<
    Map<string, number>
  >(new Map());
  const handleFinalDifferenceUpdate = useCallback(
    (empCode: string, difference: number) => {
      setEmployeeFinalDifferences((prev) => {
        const newMap = new Map(prev);
        newMap.set(empCode, difference);
        return newMap;
      });
    },
    []
  );

  const stats = useAttendanceStore((state) => state.stats);

  // Derive holiday count from the main excelData object
  // We assume `processExcelFile` adds `baseHolidaysCount` to the excelData at runtime.
  // Cast to `any` to bypass the TypeScript error.
  const baseHolidaysCount = (excelData as any)?.baseHolidaysCount ?? 0;
  // This component doesn't have selection logic, so we pass 0.
  // The calculator will use `baseHolidaysCount` as a fallback.
  const selectedHolidaysCount = 0;

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

  const handleMultipleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setIsLoading(true);
    setProcessingCount(fileArray.length);

    const uploadPromises = fileArray.map(async (file) => {
      const fileId = uuidv4();

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
          const paidLeaveData = await processPaidLeaveFile(file);
          updatePaidLeaveData(fileId, paidLeaveData);
          if (excelData && paidLeaveData.length > 0)
            mergePaidLeaveData(paidLeaveData);
          updateFileStatus(fileId, "success");
          return { success: true, fileId, fileName: file.name };
        } else if (
          /\b09\s*to\s*06\b/i.test(file.name) ||
          /\b08\.\s*09\s*to\s*06\b/i.test(file.name)
        ) {
          const customTimingEmployees = await processOTSheet(file, "09to06");
          updateFileData(fileId, { employees: customTimingEmployees } as any);
          const currentFile = getAllUploadedFiles().find(
            (f) => f.id === fileId
          );
          if (currentFile) {
            (currentFile as any).customTimingOTData = customTimingEmployees;
          }
          // console.log(
          //   `✅ Processed ${customTimingEmployees.length} 09 to 06 Time Granted employees`
          // );
          updateFileStatus(fileId, "success");
          return { success: true, fileId, fileName: file.name };
        } else if (
          (/\blunch\b/i.test(file.name) &&
            (/\bin\b/i.test(file.name) || /\bout\b/i.test(file.name))) ||
          /\b04\.\s*lunch\b/i.test(file.name)
        ) {
          // console.log("🍽️ Processing Lunch In/Out file:", file.name);
          const lunchData = await processLunchInOutFile(file);
          // console.log("✅ Processed lunch data:", {
          //   employeeCount: lunchData.length,
          //   sample: lunchData[0],
          // });
          updateFileData(fileId, { employees: lunchData } as any);
          const currentFile = getAllUploadedFiles().find(
            (f) => f.id === fileId
          );
          if (currentFile) {
            (currentFile as any).lunchInOutData = lunchData;
          }
          // console.log(
          //   `✅ Successfully processed ${lunchData.length} Lunch In/Out employees`
          // );
          updateFileStatus(fileId, "success");
          return { success: true, fileId, fileName: file.name };
        } else if (
          /\bstaff\s*ot\s*granted\b/i.test(file.name) ||
          /\b06\.\s*staff\s*ot\b/i.test(file.name)
        ) {
          const otEmployees = await processOTSheet(file, "staff");
          updateFileData(fileId, { employees: otEmployees } as any);
          const currentFile = getAllUploadedFiles().find(
            (f) => f.id === fileId
          );
          if (currentFile) {
            (currentFile as any).otGrantedData = otEmployees;
          }
          // console.log(
          //   `✅ Processed ${otEmployees.length} Staff OT Granted employees`
          // );
          updateFileStatus(fileId, "success");
          return { success: true, fileId, fileName: file.name };
        } else if (
          /\bfull\s*night\s*stay\b/i.test(file.name) ||
          /\b05\.\s*full\s*night\b/i.test(file.name)
        ) {
          const fullNightEmployees = await processOTSheet(file, "fullnight");
          updateFileData(fileId, { employees: fullNightEmployees } as any);
          const currentFile = getAllUploadedFiles().find(
            (f) => f.id === fileId
          );
          if (currentFile) {
            (currentFile as any).fullNightOTData = fullNightEmployees;
          }
          // console.log(
          //   `✅ Processed ${fullNightEmployees.length} Full Night Stay OT employees`
          // );
          updateFileStatus(fileId, "success");
          return { success: true, fileId, fileName: file.name };
        } else if (
          (/\bmaintenance\b/i.test(file.name) &&
            /\bdeduct\b/i.test(file.name)) ||
          /\b10\.\s*maintenance\b/i.test(file.name)
        ) {
          const maintenanceEmployees = await processOTSheet(
            file,
            "maintenance"
          );
          updateFileData(fileId, { employees: maintenanceEmployees } as any);
          // console.log(
          //   `✅ Processed ${maintenanceEmployees.length} Maintenance OT Deduct employees`
          // );
          updateFileStatus(fileId, "success");
          return { success: true, fileId, fileName: file.name };
        } else if (norm(file.name).includes("staff tulsi")) {
          console.log("📊 Processing Staff Tulsi HR file:", file.name);
          const hrData = await processHRFile(file, "staff");
          console.log("✅ Processed Staff HR data:", {
            employeeCount: hrData.length,
            sample: hrData[0],
          });
          updateHRData(fileId, hrData);
          updateFileStatus(fileId, "success");
          return { success: true, fileId, fileName: file.name };
        } else if (norm(file.name).includes("worker tulsi")) {
          console.log("📊 Processing Worker Tulsi HR file:", file.name);
          const hrData = await processHRFile(file, "worker");
          console.log("✅ Processed Worker HR data:", {
            employeeCount: hrData.length,
            sample: hrData[0],
          });
          updateHRData(fileId, hrData);
          updateFileStatus(fileId, "success");
          return { success: true, fileId, fileName: file.name };
        } else {
          const processedData = await processExcelFile(file);
          updateFileData(fileId, processedData);
          if (isRequired) {
            setExcelData(processedData);
            remergeAllPaidLeaveIfAny();

            // ADD THIS CODE HERE - Populate store with employee 1 data
            if (processedData.employees && processedData.employees.length > 0) {
              const emp1 = processedData.employees[0] as any;
              // console.log("✅ Populated attendance store with employee 1 data");
            }
          }

          if (isRequired) {
            setExcelData(processedData);
            remergeAllPaidLeaveIfAny();
          }
          updateFileStatus(fileId, "success");
          return { success: true, fileId, fileName: file.name };
        }
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
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
      (r) => r.status === "fulfilled" && r.value?.success
    ).length;
    const failCount = results.filter(
      (r) =>
        r.status === "rejected" ||
        (r.status === "fulfilled" && !r.value?.success)
    ).length;

    setIsLoading(false);
    setProcessingCount(0);

    if (successCount > 0 && failCount === 0) {
      // alert(`✓ All ${successCount} file(s) uploaded successfully!`);
    } else if (successCount > 0 && failCount > 0) {
      // alert(
      //   `⚠️ ${successCount} file(s) uploaded successfully, ${failCount} failed.`
      // );
    } else {
      // alert(`✕ All ${failCount} file(s) failed to upload.`);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSingleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileId = uuidv4();

    const guessedCategory = guessCategoryFromFilename(file.name);
    const categoryName = selectedFileType || guessedCategory;
    const isRequired = REQUIRED_FILES.includes(
      categoryName as (typeof REQUIRED_FILES)[number]
    );

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
        if (excelData && paidLeaveData.length > 0)
          mergePaidLeaveData(paidLeaveData);
        updateFileStatus(fileId, "success");
      } else if (
        /\b09\s*to\s*06\b/i.test(file.name) ||
        /\b08\.\s*09\s*to\s*06\b/i.test(file.name)
      ) {
        const customTimingEmployees = await processOTSheet(file, "09to06");
        updateFileData(fileId, { employees: customTimingEmployees } as any);
        const currentFile = getAllUploadedFiles().find((f) => f.id === fileId);
        if (currentFile) {
          (currentFile as any).customTimingOTData = customTimingEmployees;
        }
        updateFileStatus(fileId, "success");
      } else if (
        /\bstaff\s*ot\s*granted\b/i.test(file.name) ||
        /\b06\.\s*staff\s*ot\b/i.test(file.name)
      ) {
        const otEmployees = await processOTSheet(file, "staff");
        updateFileData(fileId, { employees: otEmployees } as any);
        const currentFile = getAllUploadedFiles().find((f) => f.id === fileId);
        if (currentFile) {
          (currentFile as any).otGrantedData = otEmployees;
        }
        updateFileStatus(fileId, "success");
      } else if (
        /\bfull\s*night\s*stay\b/i.test(file.name) ||
        /\b05\.\s*full\s*night\b/i.test(file.name)
      ) {
        const fullNightEmployees = await processOTSheet(file, "fullnight");
        updateFileData(fileId, { employees: fullNightEmployees } as any);
        const currentFile = getAllUploadedFiles().find((f) => f.id === fileId);
        if (currentFile) {
          (currentFile as any).fullNightOTData = fullNightEmployees;
        }
        updateFileStatus(fileId, "success");
      } else if (
        (/\blunch\b/i.test(file.name) &&
          (/\bin\b/i.test(file.name) || /\bout\b/i.test(file.name))) ||
        /\b04\.\s*lunch\b/i.test(file.name)
      ) {
        const lunchData = await processLunchInOutFile(file);
        updateFileData(fileId, { employees: lunchData } as any);
        const currentFile = getAllUploadedFiles().find((f) => f.id === fileId);
        if (currentFile) {
          (currentFile as any).lunchInOutData = lunchData;
        }
        updateFileStatus(fileId, "success");
      } else if (
        (/\bmaintenance\b/i.test(file.name) && /\bdeduct\b/i.test(file.name)) ||
        /\b10\.\s*maintenance\b/i.test(file.name)
      ) {
        const maintenanceEmployees = await processOTSheet(file, "maintenance");
        updateFileData(fileId, { employees: maintenanceEmployees } as any);
        updateFileStatus(fileId, "success");
      } else if (
        norm(file.name).includes("staff tulsi") ||
        categoryName === "Staff Tulsi"
      ) {
        // console.log("📊 Processing Staff Tulsi HR file:", file.name);
        const hrData = await processHRFile(file, "staff");
        // console.log("✅ Processed Staff HR data:", {
        //   employeeCount: hrData.length,
        //   sample: hrData[0],
        // });
        updateHRData(fileId, hrData);
        updateFileStatus(fileId, "success");
      } else if (
        norm(file.name).includes("worker tulsi") ||
        categoryName === "Worker Tulsi"
      ) {
        // console.log("📊 Processing Worker Tulsi HR file:", file.name);
        const hrData = await processHRFile(file, "worker");
        // console.log("✅ Processed Worker HR data:", {
        //   employeeCount: hrData.length,
        //   sample: hrData[0],
        // });
        updateHRData(fileId, hrData);
        updateFileStatus(fileId, "success");
      } else {
        const processedData = await processExcelFile(file);
        updateFileData(fileId, processedData);
        if (isRequired) {
          setExcelData(processedData);
          remergeAllPaidLeaveIfAny();
        }
        updateFileStatus(fileId, "success");
      }
    } catch (error) {
      console.error("Error processing file:", error);
      updateFileStatus(
        fileId,
        "error",
        error instanceof Error ? error.message : "Unknown error"
      );
      // alert(
      //   "Error processing the file. It was uploaded but may contain errors."
      // );
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
      // alert("Error exporting the Excel file. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const uploadedFiles = getAllUploadedFiles();
  const requiredFilesUploaded = REQUIRED_FILES.every((fileName) =>
    uploadedFiles.some(
      (f) => f.categoryName === fileName && f.status === "success"
    )
  );

  return (
    <div className="w-full max-w-7xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-2 text-gray-800">
        Excel File Manager
      </h2>

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
          ℹ️ Supported: Staff OT, Night Stay, Paid Leave, Lunch In/Out, HR files
          & Attendance.
        </p>
      </div>

      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <span className="text-green-600">📁</span>
          Single File Upload (With Category Selection)
        </h3>

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
              <option value="Staff Paid Leave Sheet">
                Staff Paid Leave Sheet (Optional)
              </option>
              <option value="Staff OT Granted">
                Staff OT Granted (Optional)
              </option>
              <option value="Full Night Stay Emp OT Sheet">
                Full Night Stay OT (Optional)
              </option>
              <option value="09 to 06 Time Granted Emp Sheet">
                09 to 06 Time Granted (Optional)
              </option>
              <option value="Lunch In Out Time Sheet">
                Lunch In Out Time (Optional)
              </option>
              <option value="Maintenance OT Deduct">
                Maintenance OT Deduct (Optional)
              </option>
              <option value="Staff Tulsi">Staff Tulsi (Optional)</option>
              <option value="Worker Tulsi">Worker Tulsi (Optional)</option>
            </optgroup>
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
      </div>

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
            Processing{" "}
            {processingCount > 0 ? `${processingCount} file(s)` : "file"}...
          </span>
        </div>
      )}

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
                    <p className="font-semibold text-gray-800">
                      {file.categoryName}
                    </p>
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
                    {file.status === "success" &&
                      file.data &&
                      Array.isArray(file.data.employees) && (
                        <span className="text-green-600 font-semibold">
                          ({file.data.employees.length} employees)
                        </span>
                      )}
                  </p>
                  {file.error && (
                    <p className="text-sm text-red-600 mt-1">
                      Error: {file.error}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Uploaded: {new Date(file.uploadedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-3 ml-4">
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

      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-gray-700">
          <strong>Files Progress:</strong>{" "}
          {uploadedFiles.filter((f) => f.status === "success").length}/
          {uploadedFiles.length} uploaded successfully
        </p>
        {REQUIRED_FILES.length > 0 && (
          <p className="text-sm text-gray-700 mt-2">
            <strong>Required Files:</strong>{" "}
            {requiredFilesUploaded ? (
              <span className="text-green-600 font-semibold">
                ✓ All required files uploaded
              </span>
            ) : (
              <span className="text-red-600 font-semibold">
                ✕ Please upload required file(s)
              </span>
            )}
          </p>
        )}
      </div>
<div id="comparison-section">
  <UnifiedComparison />
  <PresentDayComparison />
  <LateComparison />
  <OTComparison />
</div>
    </div>
  );
};
