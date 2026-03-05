// src/components/SalaryValidationModal.tsx
"use client";

import React, { useState, useRef } from "react";
import { validateSalary, ValidationResult, PageResult, MonthWiseValidationResult } from "@/lib/salaryValidation";

interface Props {
  onClose: () => void;
}

export default function SalaryValidationModal({ onClose }: Props) {
  const [workerFile, setWorkerFile]     = useState<File | null>(null);
  const [staffFile, setStaffFile]       = useState<File | null>(null);
  const [monthWiseFile, setMonthWiseFile] = useState<File | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [result, setResult]             = useState<ValidationResult | null>(null);
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
  const [expandedMonthWise, setExpandedMonthWise] = useState(true);

  const workerRef = useRef<HTMLInputElement | null>(null);
  const staffRef  = useRef<HTMLInputElement | null>(null);
  const monthRef  = useRef<HTMLInputElement | null>(null);

  const handleWorkerFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWorkerFile(e.target.files?.[0] ?? null); setResult(null); setError(null);
  };
  const handleStaffFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStaffFile(e.target.files?.[0] ?? null); setResult(null); setError(null);
  };
  const handleMonthFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMonthWiseFile(e.target.files?.[0] ?? null); setResult(null); setError(null);
  };

  const handleRun = async () => {
    const workerFiles = [workerFile, staffFile].filter(Boolean) as File[];
    if (!workerFiles.length || !monthWiseFile) {
      setError("Please select at least one Worker/Staff file and the Month Wise Sheet.");
      return;
    }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await validateSalary(workerFiles, monthWiseFile);
      setResult(res);
      setExpandedPages(new Set(res.pages.map((_, i) => i)));
    } catch (err: any) {
      setError(err?.message ?? "Unknown error during validation.");
    } finally {
      setLoading(false);
    }
  };

  const togglePage = (idx: number) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const formatVal = (v: number | string | null, cellFound: boolean): string => {
    if (!cellFound) return "—";
    if (v === null || v === undefined || v === "") return "0";
    if (typeof v === "number") return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    return String(v);
  };

  const matchCount = result?.pages.filter((p) => p.allMatch).length ?? 0;
  const totalPages = result?.pages.length ?? 0;
  const canRun = (workerFile || staffFile) && monthWiseFile;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl mt-6 mb-8">

        {/* ── Header ────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold text-white">💰 Salary Page-wise Total Validation</h2>
            <p className="text-indigo-200 text-sm mt-1">Compares Grand Total rows from each page with the Month Wise Sheet</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white hover:bg-white/20 w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all">✕</button>
        </div>

        <div className="p-6">

          {/* ── File Upload Row — 3 columns ───────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

            {/* Worker File */}
            <FileCard
              label="Worker Excel File"
              hint="e.g. 11. Worker Tulsi.xlsx"
              icon="📑"
              color="indigo"
              file={workerFile}
              inputRef={workerRef}
              onChange={handleWorkerFile}
              onClear={() => { setWorkerFile(null); if (workerRef.current) workerRef.current.value = ""; }}
            />

            {/* Staff File */}
            <FileCard
              label="Staff Excel File"
              hint="e.g. 12. Staff Tulsi.xlsx"
              icon="📋"
              color="emerald"
              file={staffFile}
              inputRef={staffRef}
              onChange={handleStaffFile}
              onClear={() => { setStaffFile(null); if (staffRef.current) staffRef.current.value = ""; }}
            />

            {/* Month Wise File */}
            <FileCard
              label="Month Wise Sheet"
              hint="e.g. 13. Month Wise Sheet.xlsx"
              icon="📊"
              color="purple"
              file={monthWiseFile}
              inputRef={monthRef}
              onChange={handleMonthFile}
              onClear={() => { setMonthWiseFile(null); if (monthRef.current) monthRef.current.value = ""; }}
            />
          </div>

          {/* ── Run Button ────────────────────────────────── */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={handleRun}
              disabled={loading || !canRun}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              {loading ? (<><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Running…</>) : "▶ Run Validation"}
            </button>
            {result && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${matchCount === totalPages ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                {matchCount === totalPages ? "✅" : "⚠️"} {matchCount}/{totalPages} pages fully matched
              </div>
            )}
          </div>

          {/* ── Error ─────────────────────────────────────── */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">❌ {error}</div>
          )}

          {/* ── Results ───────────────────────────────────── */}
          {result && result.monthWiseValidation && (
            <MonthWiseSection
              data={result.monthWiseValidation}
              expanded={expandedMonthWise}
              onToggle={() => setExpandedMonthWise(p => !p)}
              formatVal={formatVal}
            />
          )}

          {result && result.pages.length === 0 && (
            <div className="p-6 text-center text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
              No salary pages detected. Ensure the files contain "SALARY FOR THE MONTH OF…" headers.
            </div>
          )}

          {result && result.pages.map((page, idx) => (
            <PageSection
              key={idx}
              page={page}
              expanded={expandedPages.has(idx)}
              onToggle={() => togglePage(idx)}
              formatVal={formatVal}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── File Card ────────────────────────────────────────────────────────────────

type CardColor = "indigo" | "emerald" | "purple";

const colorMap: Record<CardColor, { border: string; bg: string; hoverBorder: string; hoverBg: string; label: string; hint: string }> = {
  indigo:  { border: "border-indigo-300",  bg: "bg-indigo-50",  hoverBorder: "hover:border-indigo-500",  hoverBg: "hover:bg-indigo-100",  label: "text-indigo-800",  hint: "text-indigo-500"  },
  emerald: { border: "border-emerald-300", bg: "bg-emerald-50", hoverBorder: "hover:border-emerald-500", hoverBg: "hover:bg-emerald-100", label: "text-emerald-800", hint: "text-emerald-500" },
  purple:  { border: "border-purple-300",  bg: "bg-purple-50",  hoverBorder: "hover:border-purple-500",  hoverBg: "hover:bg-purple-100",  label: "text-purple-800",  hint: "text-purple-500"  },
};

function FileCard({
  label, hint, icon, color, file, inputRef, onChange, onClear,
}: {
  label: string; hint: string; icon: string; color: CardColor;
  file: File | null; inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  const c = colorMap[color];
  return (
    <div
      className={`border-2 border-dashed ${c.border} rounded-xl p-5 ${c.bg} cursor-pointer ${c.hoverBorder} ${c.hoverBg} transition-all`}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onChange} />
      <div className="flex items-center gap-3">
        <span className="text-3xl">{icon}</span>
        <div>
          <p className={`font-semibold text-sm ${c.label}`}>{label}</p>
          <p className={`text-xs mt-0.5 ${c.hint}`}>{file ? file.name : hint}</p>
        </div>
      </div>
      {file && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-green-600 text-sm font-medium">✅ {file.name}</span>
          <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="text-red-500 text-xs hover:text-red-700">✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Page Section ─────────────────────────────────────────────────────────────

function PageSection({
  page, expanded, onToggle, formatVal,
}: {
  page: PageResult; expanded: boolean;
  onToggle: () => void;
  formatVal: (v: number | string | null, cellFound: boolean) => string;
}) {
  const mismatchCount = page.columns.filter((c) => !c.match).length;

  return (
    <div className={`mb-4 rounded-xl border-2 overflow-hidden ${page.allMatch ? "border-green-300" : "border-red-300"}`}>
      <div
        className={`flex items-center justify-between px-5 py-3 cursor-pointer ${page.allMatch ? "bg-green-50" : "bg-red-50"}`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{page.allMatch ? "✅" : "❌"}</span>
          <div>
            <p className="font-bold text-gray-800 text-sm">{page.workerGroup}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Rows {page.pageStartRow}–{page.pageEndRow}
              {page.grandTotalRow ? ` · Grand Total @ Row ${page.grandTotalRow}` : " · Grand Total not found"}
              {page.monthWiseRow  ? ` · Month Wise @ Row ${page.monthWiseRow}`   : " · Month Wise row not matched"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!page.allMatch && (
            <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded-full">
              {mismatchCount} mismatch{mismatchCount !== 1 ? "es" : ""}
            </span>
          )}
          {page.allMatch && (
            <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">All matched</span>
          )}
          <span className="text-gray-400 text-lg">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-2.5 font-semibold">Column</th>
                <th className="text-right px-4 py-2.5 font-semibold">Grand Total (Worker)</th>
                <th className="text-center px-3 py-2.5 font-semibold text-gray-400">Cell</th>
                <th className="text-right px-4 py-2.5 font-semibold">Month Wise Sheet</th>
                <th className="text-center px-3 py-2.5 font-semibold text-gray-400">Cell</th>
                <th className="text-center px-4 py-2.5 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {page.columns.map((col, ci) => (
                <tr key={ci} className={`border-t ${col.match ? "bg-white hover:bg-green-50" : "bg-red-50 hover:bg-red-100"} transition-colors`}>
                  <td className="px-4 py-2.5 font-semibold text-gray-700">{col.field}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-800">{formatVal(col.workerValue, !!col.workerCell)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {col.workerCell
                      ? <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{col.workerCell}</span>
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-800">{formatVal(col.monthWiseValue, !!col.monthWiseCell)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {col.monthWiseCell
                      ? <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{col.monthWiseCell}</span>
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {!col.workerCell || !col.monthWiseCell
                      ? <span className="text-yellow-600 text-xs font-semibold bg-yellow-100 px-2 py-0.5 rounded-full">⚠ Col Not Found</span>
                      : col.match
                        ? <span className="text-green-700 text-base">✅</span>
                        : <span className="text-red-600 text-base">❌</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {page.columns.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-4">No columns matched. Check header names in both sheets.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Month Wise Section ───────────────────────────────────────────────────────

function MonthWiseSection({
  data, expanded, onToggle, formatVal,
}: {
  data: MonthWiseValidationResult; expanded: boolean;
  onToggle: () => void;
  formatVal: (v: number | string | null, cellFound: boolean) => string;
}) {
  const mismatchCount = data.columns.filter((c) => !c.match).length;

  return (
    <div className={`mb-4 rounded-xl border-2 overflow-hidden ${data.allMatch ? "border-green-300" : "border-red-300"}`}>
      <div
        className={`flex items-center justify-between px-5 py-3 cursor-pointer ${data.allMatch ? "bg-green-50" : "bg-red-50"}`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{data.allMatch ? "✅" : "❌"}</span>
          <div>
            <p className="font-bold text-gray-800 text-sm">Month Wise Sheet Totals Validation</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Validates that physical sums of Month Wise columns match their Grand Total row (found at row {data.columns[0]?.grandTotalRow ?? "?"})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!data.allMatch && (
            <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded-full">
              {mismatchCount} mismatch{mismatchCount !== 1 ? "es" : ""}
            </span>
          )}
          {data.allMatch && (
            <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">All matched</span>
          )}
          <span className="text-gray-400 text-lg">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-2.5 font-semibold">Column</th>
                <th className="text-right px-4 py-2.5 font-semibold">Physical Sum</th>
                <th className="text-right px-4 py-2.5 font-semibold">Grand Total Row</th>
                <th className="text-center px-3 py-2.5 font-semibold text-gray-400">Cell</th>
                <th className="text-center px-4 py-2.5 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.columns.map((col, ci) => (
                <tr key={ci} className={`border-t ${col.match ? "bg-white hover:bg-green-50" : "bg-red-50 hover:bg-red-100"} transition-colors`}>
                  <td className="px-4 py-2.5 font-semibold text-gray-700">{col.field}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-800">{formatVal(col.physicalSum, true)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-800">{formatVal(col.grandTotalValue, !!col.grandTotalCell)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {col.grandTotalCell
                      ? <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{col.grandTotalCell}</span>
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {!col.grandTotalCell
                      ? <span className="text-yellow-600 text-xs font-semibold bg-yellow-100 px-2 py-0.5 rounded-full">⚠ Col Not Found</span>
                      : col.match
                        ? <span className="text-green-700 text-base">✅</span>
                        : <span className="text-red-600 text-base">❌</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.columns.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-4">No columns matched. Check header names.</p>
          )}
        </div>
      )}
    </div>
  );
}
