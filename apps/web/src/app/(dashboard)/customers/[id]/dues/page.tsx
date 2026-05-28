'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/format';

interface DueItem {
  id: string;
  originalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string };
  sale: { id: string; invoiceNumber: string; grandTotal: string };
}

export default function CustomerDuesHistoryPage() {
  const params = useParams();
  const [data, setData] = useState<{ items: DueItem[]; pagination: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [customerName, setCustomerName] = useState('');

  const fetchDues = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ items: DueItem[]; pagination: any }>('/dues', {
        params: { customerId: params.id as string, page, pageSize: 20 },
      });
      setData(result);
      if (result.items.length > 0) {
        setCustomerName(result.items[0].customer.name);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [params.id, page]);

  useEffect(() => { fetchDues(); }, [fetchDues]);

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

  const paidPct = (due: DueItem) => {
    const original = parseFloat(due.originalAmount);
    const paid = parseFloat(due.paidAmount);
    if (original === 0) return 0;
    return Math.round((paid / original) * 100);
  };

  return (
    <div>
      <div className="mb-6">
        <Link href={`/customers/${params.id}`} className="text-sm text-gray-500 hover:text-gray-700">&larr; Back to Customer</Link>
        <h1 className="text-2xl font-bold text-gray-900">
          Due History {customerName ? `— ${customerName}` : ''}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Original</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : data?.items.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No dues found for this customer</td></tr>
            ) : (
              data?.items.map((due) => (
                <tr key={due.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono">{due.sale.invoiceNumber}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatINR(due.originalAmount)}</td>
                  <td className="px-4 py-3 text-sm text-right text-green-600">{formatINR(due.paidAmount)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-red-600">{formatINR(due.balanceAmount)}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: `${paidPct(due)}%` }} />
                    </div>
                    <span className="text-xs text-gray-400">{paidPct(due)}%</span>
                  </td>
                  <td className="px-4 py-3 text-sm">{statusBadge(due.status)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(due.createdAt)}</td>
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/dues/${due.id}`} className="text-gold-700 hover:underline text-xs">View</Link>
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
