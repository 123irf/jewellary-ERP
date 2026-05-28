'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface Movement {
  id: string;
  type: string;
  quantityDelta: number;
  stockAfter: number;
  notes: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string; category: { id: string; name: string } };
  createdBy: { id: string; name: string };
  sale?: { id: string; invoiceNumber: string } | null;
  vendorTransaction?: { id: string; referenceNo: string | null; vendor: { id: string; name: string } } | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const MOVEMENT_TYPES = [
  'OPENING', 'PURCHASE', 'RETURN_OUT', 'SALE', 'VOID_REVERSAL',
  'CUSTOMER_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'AUDIT_CORRECTION',
];

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');

    const params: Record<string, string | number | undefined> = {
      page,
      pageSize: 50,
      type: typeFilter || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
    };

    apiFetch<{ movements: Movement[]; pagination: Pagination }>('/stock-movements', { params })
      .then((data) => {
        setMovements(data.movements);
        setPagination(data.pagination);
      })
      .catch((err: any) => setError(err.message || 'Failed to load movements'))
      .finally(() => setLoading(false));
  }, [page, typeFilter, from, to]);

  function getSourceLabel(m: Movement): string {
    if (m.sale) return `Invoice ${m.sale.invoiceNumber}`;
    if (m.vendorTransaction) {
      const ref = m.vendorTransaction.referenceNo ? ` (${m.vendorTransaction.referenceNo})` : '';
      return `${m.vendorTransaction.vendor.name}${ref}`;
    }
    return '--';
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Stock Movements</h1>
        <Link
          href="/stock-movements/reconciliation"
          className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Reconciliation Health Check
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow px-4 py-3 mb-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">All Types</option>
            {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        {(typeFilter || from || to) && (
          <button
            onClick={() => { setTypeFilter(''); setFrom(''); setTo(''); setPage(1); }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Clear filters
          </button>
        )}
        {pagination && (
          <span className="text-sm text-gray-500 ml-auto">{pagination.total} movements</span>
        )}
      </div>

      {error && <div className="text-center py-4 text-red-600 text-sm">{error}</div>}

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Delta</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock After</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">By</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : movements.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No movements found</td></tr>
            ) : (
              movements.map((m) => (
                <tr
                  key={m.id}
                  className={
                    m.type === 'AUDIT_CORRECTION' ? 'bg-red-50' :
                    m.type.includes('ADJUSTMENT') || m.type === 'DAMAGE' ? 'bg-amber-50' : ''
                  }
                >
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(m.createdAt)}</td>
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/inventory/${m.product.id}`} className="text-gold-700 hover:underline font-medium">
                      {m.product.name}
                    </Link>
                    <div className="text-xs text-gray-400">{m.product.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{m.product.category.name}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      m.quantityDelta > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {m.type}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-mono ${m.quantityDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {m.quantityDelta > 0 ? '+' : ''}{m.quantityDelta}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-medium">
                    <span className="px-2 py-0.5 bg-gray-100 rounded">{m.stockAfter}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{getSourceLabel(m)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{m.createdBy.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 max-w-xs truncate">{m.notes || '--'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page >= pagination.totalPages}
            className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
