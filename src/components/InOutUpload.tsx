// src/app/components/InOutUpload.tsx
'use client';

import { useState, useMemo } from 'react';
import type { EmployeeRecord } from '@/lib/parseLunchSheet';

function fmtDate(d: string) {
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

export default function InOutUpload() {
  const [data, setData] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [q, setQ] = useState('');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setData([]);
    setMeta(null);

    const form = new FormData();
    form.append('file', file);

    try {
      console.log('Uploading:', file.name);
      const res = await fetch('/api/lunch', {
        method: 'POST',
        body: form,
      });

      const json = await res.json();
      console.log('Response:', json);

      if (!res.ok) {
        throw new Error(json.error || 'Upload failed');
      }

      setData(json.data || []);
      setMeta(json.meta);
      
      if (!json.data || json.data.length === 0) {
        setError('No employee data found in the file. Check console for details.');
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data;
    return data.filter(
      (d) =>
        d.empName.toLowerCase().includes(term) || d.empCode.toLowerCase().includes(term)
    );
  }, [q, data]);

  return (
    <div className="space-y-4">
      {/* Upload */}
      <div className="border rounded p-4 bg-gray-50">
        <label className="block text-sm font-medium mb-2">Upload Excel Sheet</label>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleUpload}
          disabled={loading}
          className="block w-full text-sm text-gray-900 border border-gray-300 rounded cursor-pointer bg-white focus:outline-none"
        />
        {loading && <p className="text-sm text-blue-600 mt-2">Parsing...</p>}
        {error && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
            {error}
          </div>
        )}
        {meta && (
          <div className="mt-2 text-sm text-gray-600">
            Parsed: {meta.employeeCount} employees, {meta.totalDays} day records
          </div>
        )}
      </div>

      {/* Debug */}
      {data.length === 0 && !loading && !error && (
        <div className="text-sm text-gray-500">
          No data yet. Upload an Excel file to see results.
        </div>
      )}

      {/* Table */}
      {data.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
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
                {filtered.map((emp) => {
                  const rows: Array<{
                    key: string;
                    empCode: string;
                    empName: string;
                    day: { date: string; sessions: any[] };
                  }> = [];
                  emp.days.forEach((day) => {
                    rows.push({
                      key: `${emp.empCode}-${day.date}`,
                      empCode: emp.empCode,
                      empName: emp.empName,
                      day,
                    });
                  });
                  if (rows.length === 0) {
                    rows.push({
                      key: `${emp.empCode}-empty`,
                      empCode: emp.empCode,
                      empName: emp.empName,
                      day: { date: '', sessions: [] },
                    });
                  }
                  return rows.map((row, idx) => {
                    const sessions = row.day.sessions;
                    const firstIn = sessions.find((s) => s.in)?.in;
                    const lastOut = [...sessions].reverse().find((s) => s.out)?.out;
                    return (
                      <tr key={row.key} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2 align-top">
                          {idx === 0 ? row.empCode : ''}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {idx === 0 ? row.empName : ''}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {row.day.date ? fmtDate(row.day.date) : ''}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {sessions.length === 0 ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {sessions.map((s: any, i: number) => (
                                <span key={i} className="inline-flex items-center gap-1">
                                  <span className="text-green-700">{fmtTime(s.in)}</span>
                                  <span>→</span>
                                  <span className="text-red-700">{fmtTime(s.out)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {firstIn ? fmtTime(firstIn) : ''}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {lastOut ? fmtTime(lastOut) : ''}
                        </td>
                        <td className="px-3 py-2 align-top">{sessions.length || ''}</td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
