'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/format';
import { useAuthStore } from '@/store/auth';

interface DueItem {
  id: string;
  customerId: string;
  originalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string };
  sale: { id: string; invoiceNumber: string; grandTotal: string };
}

export default function DuesListPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<{ items: DueItem[]; pagination: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const fetchDues = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ items: DueItem[]; pagination: any }>('/dues', {
        params: {
          status: statusFilter || undefined,
          overdue: overdueOnly || undefined,
          page,
          pageSize: 20,
        },
      });
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, overdueOnly, page]);

  useEffect(() => { fetchDues(); }, [fetchDues]);

  const isOverdue = (due: DueItem) => {
    if (!due.dueDate) return false;
    return new Date(due.dueDate) < new Date() && (due.status === 'PENDING' || due.status === 'PARTIAL');
  };

  const paidPct = (due: DueItem) => {
    const original = parseFloat(due.originalAmount);
    const paid = parseFloat(due.paidAmount);
    if (original === 0) return 0;
    return Math.round((paid / original) * 100);
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      PARTIAL: 'bg-blue-100 text-blue-800',
      CLEARED: 'bg-green-100 text-green-800',
      VOIDED: 'bg-gray-100 text-gray-500',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100'}`}>
        {status}
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customer Dues</h1>
        {user?.role === 'ADMIN' && (
          <Link href="/dues/aging" className="bg-gold-600 text-white px-4 py-2 rounded-md hover:bg-gold-700 font-medium text-sm">
            Aging Report
          </Link>
        )}
      </div>

      <div className="flex gap-4 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PARTIAL">Partial</option>
          <option value="CLEARED">Cleared</option>
          <option value="VOIDED">Voided</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => { setOverdueOnly(e.target.checked); setPage(1); }}
            className="rounded"
          />
          Overdue only
        </label>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Original</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : data?.items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No dues found</td></tr>
            ) : (
              data?.items.map((due) => (
                <tr key={due.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/customers/${due.customer.id}`} className="text-gold-700 hover:underline font-medium">
                      {due.customer.name}
                    </Link>
                    <div className="text-xs text-gray-400">{due.customer.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono">
                    <Link href={`/dues/${due.id}`} className="text-gold-700 hover:underline">
                      {due.sale.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">{formatINR(due.originalAmount)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-red-600">{formatINR(due.balanceAmount)}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${paidPct(due)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400">{paidPct(due)}%</span>
                  </td>
                  <td className="px-4 py-3 text-sm">{statusBadge(due.status)}</td>
                  <td className={`px-4 py-3 text-sm ${isOverdue(due) ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    {due.dueDate ? formatDate(due.dueDate) : '--'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {data && data.pagination.totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} dues)
            </span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50">Previous</button>
              <button disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
