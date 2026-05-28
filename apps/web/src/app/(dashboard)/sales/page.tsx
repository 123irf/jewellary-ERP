'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/format';

interface Sale {
  id: string;
  invoiceNumber: string;
  grandTotal: string;
  status: string;
  createdAt: string;
  customerWalkIn: boolean;
  customer: { id: string; name: string; phone: string } | null;
  payments: Array<{ mode: string; amount: string }>;
  createdBy: { name: string };
}

export default function SalesListPage() {
  const [data, setData] = useState<{ items: Sale[]; pagination: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [paymentMode, setPaymentMode] = useState('');

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ items: Sale[]; pagination: any }>('/sales', {
        params: {
          page,
          pageSize: 20,
          q: search || undefined,
          status: status || undefined,
          paymentMode: paymentMode || undefined,
        },
      });
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, paymentMode]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
        <Link href="/pos" className="bg-gold-600 text-white px-4 py-2 rounded-md hover:bg-gold-700 font-medium text-sm">
          + New Sale
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Search invoice number..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Status</option>
          <option value="COMPLETED">Completed</option>
          <option value="VOIDED">Voided</option>
        </select>
        <select
          value={paymentMode}
          onChange={(e) => { setPaymentMode(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Payments</option>
          <option value="CASH">Cash</option>
          <option value="UPI">UPI</option>
          <option value="CARD">Card</option>
          <option value="CREDIT">Credit</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : data?.items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No sales found</td></tr>
            ) : (
              data?.items.map((sale) => (
                <tr key={sale.id} className={`hover:bg-gray-50 ${sale.status === 'VOIDED' ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 text-sm font-mono">
                    <Link href={`/sales/${sale.id}`} className="text-gold-700 hover:underline">
                      {sale.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(sale.createdAt)}</td>
                  <td className="px-4 py-3 text-sm">
                    {sale.customerWalkIn ? (
                      <span className="text-gray-400">Walk-in</span>
                    ) : sale.customer ? (
                      <span>{sale.customer.name} <span className="text-gray-400 text-xs">({sale.customer.phone})</span></span>
                    ) : '--'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-1">
                      {sale.payments.map((p, i) => (
                        <span key={i} className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          p.mode === 'CREDIT' ? 'bg-amber-100 text-amber-700'
                            : p.mode === 'CASH' ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {p.mode}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-medium">{formatINR(sale.grandTotal)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      sale.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {sale.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{sale.createdBy.name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {data && data.pagination.totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} sales)
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
