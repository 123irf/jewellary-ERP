'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatINR } from '@/lib/format';

interface AgingReport {
  totalOutstanding: string;
  totalDues: number;
  totalCustomers: number;
  agingBuckets: {
    current: string;
    '1-30days': string;
    '31-60days': string;
    '61-90days': string;
    '90plus': string;
  };
  customerBreakdown: Array<{
    customer: { id: string; name: string; phone: string };
    totalDue: string;
    dueCount: number;
  }>;
}

export default function AgingReportPage() {
  const [report, setReport] = useState<AgingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const result = await apiFetch<AgingReport>('/dues/aging-report');
        setReport(result);
      } catch (err: any) {
        setError(err.message || 'Failed to load aging report');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (error) return <div className="text-center py-12 text-red-600">{error}</div>;
  if (!report) return null;

  const bucketLabels: Array<{ key: keyof AgingReport['agingBuckets']; label: string; color: string }> = [
    { key: 'current', label: 'Current', color: 'bg-green-100 text-green-800' },
    { key: '1-30days', label: '1-30 Days', color: 'bg-yellow-100 text-yellow-800' },
    { key: '31-60days', label: '31-60 Days', color: 'bg-orange-100 text-orange-800' },
    { key: '61-90days', label: '61-90 Days', color: 'bg-red-100 text-red-700' },
    { key: '90plus', label: '90+ Days', color: 'bg-red-200 text-red-900' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/dues" className="text-sm text-gray-500 hover:text-gray-700">&larr; Back to Dues</Link>
          <h1 className="text-2xl font-bold text-gray-900">Aging Report</h1>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow px-4 py-3">
          <div className="text-xs text-gray-500 uppercase">Total Outstanding</div>
          <div className="text-xl font-bold text-red-600">{formatINR(report.totalOutstanding)}</div>
        </div>
        <div className="bg-white rounded-lg shadow px-4 py-3">
          <div className="text-xs text-gray-500 uppercase">Open Dues</div>
          <div className="text-xl font-bold">{report.totalDues}</div>
        </div>
        <div className="bg-white rounded-lg shadow px-4 py-3">
          <div className="text-xs text-gray-500 uppercase">Customers with Dues</div>
          <div className="text-xl font-bold">{report.totalCustomers}</div>
        </div>
      </div>

      {/* Aging buckets */}
      <div className="bg-white rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold px-4 py-3 border-b border-gray-200">Aging Buckets</h2>
        <div className="grid grid-cols-5 divide-x divide-gray-200">
          {bucketLabels.map((b) => (
            <div key={b.key} className="px-4 py-4 text-center">
              <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${b.color}`}>
                {b.label}
              </div>
              <div className="text-lg font-bold">{formatINR(report.agingBuckets[b.key])}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Customer breakdown */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h2 className="text-lg font-semibold px-4 py-3 border-b border-gray-200">By Customer</h2>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Open Dues</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {report.customerBreakdown.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500 text-sm">No outstanding dues</td></tr>
            ) : (
              report.customerBreakdown.map((row) => (
                <tr key={row.customer.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/customers/${row.customer.id}`} className="text-gold-700 hover:underline font-medium">
                      {row.customer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{row.customer.phone}</td>
                  <td className="px-4 py-3 text-sm text-center">{row.dueCount}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-red-600">{formatINR(row.totalDue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
