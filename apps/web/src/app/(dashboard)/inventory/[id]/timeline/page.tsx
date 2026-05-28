'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface Movement {
  id: string;
  type: string;
  quantityDelta: number;
  stockAfter: number;
  notes: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
  sale?: { id: string; invoiceNumber: string } | null;
  vendorTransaction?: { id: string; referenceNo: string | null; vendor: { id: string; name: string } } | null;
}

export default function TimelinePage() {
  const { id } = useParams<{ id: string }>();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch<{ movements: Movement[]; pagination: { total: number } }>(
      `/inventory/products/${id}/movements`,
      { params: { page, pageSize: 50, type: typeFilter || undefined } },
    )
      .then((data) => {
        setMovements(data.movements);
        setTotal(data.pagination.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, page, typeFilter]);

  const movementTypes = [
    'OPENING', 'PURCHASE', 'RETURN_OUT', 'SALE', 'VOID_REVERSAL',
    'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'AUDIT_CORRECTION',
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Stock Movement Timeline</h1>

      {/* Stock-after chart placeholder */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Stock Level Over Time</h2>
        <div className="h-32 flex items-center justify-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded">
          Chart (Recharts) — renders stock-after values as a stepped line
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Types</option>
          {movementTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-sm text-gray-500 self-center">{total} movements total</span>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
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
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : movements.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No movements found</td></tr>
            ) : (
              movements.map((m) => (
                <tr key={m.id} className={m.type.includes('ADJUSTMENT') || m.type === 'DAMAGE' ? 'bg-amber-50' : ''}>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(m.createdAt)}</td>
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
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {m.sale ? `Invoice ${m.sale.invoiceNumber}` :
                     m.vendorTransaction ? `${m.vendorTransaction.vendor.name}${m.vendorTransaction.referenceNo ? ` (${m.vendorTransaction.referenceNo})` : ''}` :
                     '--'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{m.createdBy.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 max-w-xs truncate">{m.notes || '--'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
