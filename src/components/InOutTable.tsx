// app/components/InOutTable.tsx
'use client';

import { useMemo, useState } from 'react';
import type { EmployeeRecord, DayRecord, Session } from '@/lib/parseLunchSheet';

function fmtDate(d: string) {
  // yyyy-mm-dd -> dd MMM yyyy
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, day || 1);
  return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(ts?: string) {
  if (!ts) return '';
  const dt = new Date(ts);
  if (isNaN(dt.getTime())) return ts;
  return dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function InOutTable({ data }: { data: EmployeeRecord[] }) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data;
    return data.filter(d =>
      d.empName.toLowerCase().includes(term) || d.empCode.toLowerCase().includes(term)
    );
  }, [q, data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search employee or code..."
          className="border rounded px-3 py-2 w-full max-w-md"
        />
        <span className="text-sm text-gray-500">{filtered.length} employees</span>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">EMP Code</th>
              <th className="text-left px-3 py-2">Employee Name</th>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Sessions (In → Out)</th>
              <th className="text-left px-3 py-2">First In</th>
              <th className="text-left px-3 py-2">Last Out</th>
              <th className="text-left px-3 py-2"># Sessions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => {
              const rows: Array<{ key: string; empCode: string; empName: string; day: DayRecord }> = [];
              emp.days.forEach(day => {
                rows.push({ key: `${emp.empCode}-${day.date}`, empCode: emp.empCode, empName: emp.empName, day });
              });
              if (rows.length === 0) {
                rows.push({ key: `${emp.empCode}-empty`, empCode: emp.empCode, empName: emp.empName, day: { date: '', sessions: [] } });
              }
              return rows.map((row, idx) => {
                const sessions = row.day.sessions;
                const firstIn = sessions.find(s => s.in)?.in;
                const lastOut = [...sessions].reverse().find(s => s.out)?.out;
                return (
                  <tr key={row.key} className="border-t">
                    <td className="px-3 py-2 align-top">{idx === 0 ? row.empCode : ''}</td>
                    <td className="px-3 py-2 align-top">{idx === 0 ? row.empName : ''}</td>
                    <td className="px-3 py-2 align-top">{row.day.date ? fmtDate(row.day.date) : ''}</td>
                    <td className="px-3 py-2 align-top">
                      {sessions.length === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {sessions.map((s, i) => (
                            <span key={i} className="inline-flex items-center gap-1">
                              <span className="text-green-700">{fmtTime(s.in)}</span>
                              <span>→</span>
                              <span className="text-red-700">{fmtTime(s.out)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">{firstIn ? fmtTime(firstIn) : ''}</td>
                    <td className="px-3 py-2 align-top">{lastOut ? fmtTime(lastOut) : ''}</td>
                    <td className="px-3 py-2 align-top">{sessions.length || ''}</td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
