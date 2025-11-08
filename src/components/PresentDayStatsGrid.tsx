// components/PresentDayStatsGrid.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { EmployeeData } from '@/lib/types';
import { useExcel } from '@/context/ExcelContext';

// Utility to normalize strings
const canon = (s: string) => (s ?? '').toUpperCase().trim();
const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, '');
const numericOnly = (s: string) => (s.match(/\d+/g)?.join('') ?? '');
const dropLeadingZeros = (s: string) => s.replace(/^0+/, '');
const nameKey = (s: string) => stripNonAlnum(s);

// ---- Paid Leave Lookup Hook ---- //
function usePaidLeaveLookup() {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
    const plRows = files
      .filter(
        (f) =>
          f.status === 'success' &&
          Array.isArray(f.paidLeaveData) &&
          f.paidLeaveData.length > 0
      )
      .flatMap((f) => f.paidLeaveData!);

    type PLRec = (typeof plRows)[number] & { _keys: string[]; _nameKey: string };

    const withKeys: PLRec[] = plRows.map((pl) => {
      const raw = canon(pl.empCode);
      const s1 = stripNonAlnum(raw);
      const num = numericOnly(raw);
      const no0 = dropLeadingZeros(num);
      const pads = [4, 5, 6].map((w) => num.padStart(w, '0'));

      const keySet = new Set<string>([
        raw,
        s1,
        num,
        no0,
        ...pads
      ]);

      return { ...pl, _keys: Array.from(keySet), _nameKey: nameKey(pl.empName) };
    });

    const byKey = new Map<string, PLRec>();
    withKeys.forEach((pl) => pl._keys.forEach((k) => byKey.set(k, pl)));

    const byName = new Map<string, PLRec[]>();
    withKeys.forEach((pl) => {
      const arr = byName.get(pl._nameKey) ?? [];
      arr.push(pl);
      byName.set(pl._nameKey, arr);
    });

    const getPL = (emp: Pick<EmployeeData, 'empCode' | 'empName'>): number => {
      const raw = canon(emp.empCode);
      const s1 = stripNonAlnum(raw);
      const num = numericOnly(raw);
      const no0 = dropLeadingZeros(num);
      const pads = [4, 5, 6].map((w) => num.padStart(w, '0'));

      const candidates = [raw, s1, num, no0, ...pads];

      for (const k of candidates) {
        const hit = byKey.get(k);
        if (hit) return hit.paidDays ?? 0;
      }

      const foundByName = byName.get(nameKey(emp.empName)) ?? [];
      if (foundByName.length === 1) return foundByName[0].paidDays ?? 0;

      return 0;
    };

    return { getPL };
  }, [getAllUploadedFiles]);
}

// ---- Component ---- //
interface Props {
  employee: EmployeeData;
  baseHolidaysCount?: number;
  selectedHolidaysCount?: number;
}

export const PresentDayStatsGrid: React.FC<Props> = ({
  employee,
  baseHolidaysCount = 0,
  selectedHolidaysCount = 0,
}) => {
  const [tooltips, setTooltips] = useState<{ [k: string]: boolean }>({});
  const { getPL } = usePaidLeaveLookup();

  const stats = useMemo(() => {
    const OT_THRESHOLD_MIN = 4 * 60 + 5;
    
    // Count P/A days (each counts as 0.5) and ADJ-P days (each counts as full day)
    let paCount = 0;
    let fullPresentDays = 0;
    let adjPresentDays = 0; // NEW: Count ADJ-P days
    
    employee.days?.forEach((day) => {
      const status = (day.attendance.status || '').toUpperCase();
      if (status === 'P') {
        fullPresentDays++;
      } else if (status === 'P/A' || status === 'PA') {
        paCount++;
      } else if (status === 'ADJ-P') {
        adjPresentDays++; // NEW: Count adjustment present days
      }
    });
    
    // Calculate adjusted present days: full days + adjustment days + (P/A days * 0.5)
    const PD_excel = employee.present || 0; // Original from Excel
    const paAdjustment = paCount * 0.5; // Each P/A is half day
    const PAA = fullPresentDays + adjPresentDays + paAdjustment; // NEW: Added adjPresentDays
    
    const H_base = selectedHolidaysCount || baseHolidaysCount || 0;
    const Total = PAA + H_base;

    const otHoursStr = employee.totalOTHours || '0:00';
    const lateMinsTotal = employee.totalLateMins || 0;
    const [h, m] = otHoursStr.split(':').map(Number);
    const OT_min = (h || 0) * 60 + (m || 0);

    let AdditionalOT = 0;
    if (OT_min < lateMinsTotal) AdditionalOT = OT_min < OT_THRESHOLD_MIN ? 0.5 : 1;

    const ATotal = Math.max(Total - AdditionalOT, 0);

    const pl = getPL(employee) || 0;
    const GrandTotal = Math.max(ATotal + pl, 0);

    return { 
      PD_excel, 
      PAA: Number(PAA.toFixed(1)), // Round to 1 decimal 
      H_base, 
      Total: Number(Total.toFixed(1)), 
      ATotal: Number(ATotal.toFixed(1)), 
      PL_days: pl, 
      GrandTotal: Number(GrandTotal.toFixed(1)),
      paCount,
      adjPresentDays // NEW: Include in return
    };
  }, [employee, baseHolidaysCount, selectedHolidaysCount, getPL]);

  const tooltipTexts: any = {
    PD_excel: 'Present days counted directly from attendance sheet.',
    PAA: 'Present days after adjustment: Full Present days + ADJ-P days + (P/A days × 0.5). ADJ-P (Adjustment Present) counts as full day, P/A (Partial Attendance) counts as half day.',
    H_base: 'Holidays selected from Holiday Management.',
    Total: 'Present After Adj + Holidays',
    ATotal: 'Adjusted total considering OT deduction rules.',
    PL_days: 'Paid Leave taken from Staff Paid Leave Sheet.',
    GrandTotal: 'A Total + Paid Leave',
  };

  const StatBox = ({ label, value, bgColor, textColor, tooltipKey }: any) => (
    <div
      className={`relative text-center p-2 w-[130px] ${bgColor} rounded-md border ${textColor} transition-all hover:shadow`}
    >
      <div className="absolute top-1 right-1">
        <button
          onClick={() => setTooltips((p) => ({ ...p, [tooltipKey]: !p[tooltipKey] }))}
          className="w-4 h-4 bg-gray-400 hover:bg-gray-600 text-white rounded-full text-[10px]"
        >
          ?
        </button>
        {tooltips[tooltipKey] && (
          <div className="absolute top-full right-0 mt-2 w-56 bg-gray-900 text-white p-2 rounded shadow-lg z-50 text-xs">
            {tooltipTexts[tooltipKey]}
          </div>
        )}
      </div>

      <div className="text-[11px] text-gray-600">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
        <span className="text-indigo-600">📊</span>
        Present Day Calculation
      </h4>

      {/* Info about P/A and ADJ-P count */}
      {(stats.paCount > 0 || stats.adjPresentDays > 0) && (
        <div className="mb-2 text-xs text-gray-600 bg-yellow-50 p-2 rounded space-y-1">
          {stats.paCount > 0 && (
            <div>
              ℹ️ Found {stats.paCount} P/A (Partial Attendance) day{stats.paCount > 1 ? 's' : ''}, counted as {stats.paCount * 0.5} day{stats.paCount > 1 ? 's' : ''}
            </div>
          )}
          {stats.adjPresentDays > 0 && (
            <div>
              ✅ Found {stats.adjPresentDays} ADJ-P (Adjustment Present) day{stats.adjPresentDays > 1 ? 's' : ''}, counted as full day{stats.adjPresentDays > 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* HORIZONTAL WRAP LAYOUT */}
      <div className="flex flex-wrap gap-2">
        <StatBox label="PD (Excel)" value={stats.PD_excel} bgColor="bg-green-50" textColor="text-green-700" tooltipKey="PD_excel" />
        <StatBox label="Present After Adj" value={stats.PAA} bgColor="bg-teal-50" textColor="text-teal-700" tooltipKey="PAA" />
        <StatBox label="Holidays (Base)" value={stats.H_base} bgColor="bg-blue-50" textColor="text-blue-700" tooltipKey="H_base" />
        <StatBox label="Total" value={stats.Total} bgColor="bg-indigo-50" textColor="text-indigo-700" tooltipKey="Total" />
        <StatBox label="A Total" value={stats.ATotal} bgColor="bg-purple-50" textColor="text-purple-700" tooltipKey="ATotal" />
        <StatBox label="Paid Leave" value={stats.PL_days} bgColor="bg-orange-50" textColor="text-orange-700" tooltipKey="PL_days" />
        <StatBox label="Grand Total" value={stats.GrandTotal} bgColor="bg-emerald-50" textColor="text-emerald-700" tooltipKey="GrandTotal" />
      </div>
    </div>
  );
};