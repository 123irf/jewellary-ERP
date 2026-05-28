'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/format';
import { useAuthStore } from '@/store/auth';

interface Transaction {
  id: string;
  txnType: string;
  direction: string;
  amount: string;
  balanceAfter: string;
  referenceNo: string | null;
  notes: string | null;
  txnDate: string;
  createdBy: { name: string };
  items: Array<{ quantity: number; ratePerUnit: string; product: { name: string; sku: string } }>;
}

export default function VendorLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<{ items: Transaction[]; pagination: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [txnType, setTxnType] = useState('');
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggleRow(txnId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(txnId)) next.delete(txnId);
      else next.add(txnId);
      return next;
    });
  }

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ items: Transaction[]; pagination: any }>(
        `/vendors/${id}/ledger`,
        { params: { page, pageSize: 30, txnType: txnType || undefined, q: search || undefined } },
      );
      setData(result);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [id, page, txnType, search]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  const txnTypes = ['OPENING_BALANCE', 'PURCHASE', 'RETURN', 'PAYMENT', 'ADVANCE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'ADJUSTMENT'];

  async function handleExport() {
    try {
      window.open(`${process.env.NEXT_PUBLIC_API_URL}/vendors/${id}/ledger/export`, '_blank');
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vendor Ledger</h1>
        {user?.role === 'ADMIN' && (
          <button onClick={handleExport} className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50">Export CSV</button>
        )}
      </div>

      <div className="flex gap-4 mb-4">
        <select value={txnType} onChange={(e) => { setTxnType(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
          <option value="">All Types</option>
          {txnTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          type="text" placeholder="Search ref# or notes..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
        />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : data?.items.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No transactions</td></tr>
            ) : (
              data?.items.map((txn) => {
                const bal = parseFloat(txn.balanceAfter);
                const hasItems = txn.items && txn.items.length > 0;
                const isExpanded = expandedRows.has(txn.id);
                return (
                  <React.Fragment key={txn.id}>
                    <tr
                      className={`${txn.txnType === 'ADJUSTMENT' ? 'bg-amber-50' : ''} ${hasItems ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      onClick={hasItems ? () => toggleRow(txn.id) : undefined}
                    >
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {hasItems && <span className="mr-1 text-xs text-gray-400">{isExpanded ? '▼' : '▶'}</span>}
                        {formatDate(txn.txnDate)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          txn.direction === 'CREDIT' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>{txn.txnType}</span>
                        {hasItems && <span className="ml-1 text-xs text-gray-400">({txn.items.length} items)</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-green-600">
                        {txn.direction === 'DEBIT' ? formatINR(txn.amount) : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-red-600">
                        {txn.direction === 'CREDIT' ? formatINR(txn.amount) : ''}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-mono font-medium ${
                        bal > 0 ? 'text-red-600' : bal < 0 ? 'text-green-600' : ''
                      }`}>{formatINR(txn.balanceAfter)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{txn.referenceNo || '--'}</td>
                      <td className="px-4 py-3 text-sm text-gray-400 max-w-xs truncate">{txn.notes || '--'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{txn.createdBy.name}</td>
                    </tr>
                    {hasItems && isExpanded && (
                      <tr>
                        <td colSpan={8} className="px-8 py-2 bg-gray-50">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-400">
                                <th className="text-left py-1 font-medium">Product</th>
                                <th className="text-left py-1 font-medium">SKU</th>
                                <th className="text-right py-1 font-medium">Qty</th>
                                <th className="text-right py-1 font-medium">Rate</th>
                                <th className="text-right py-1 font-medium">Line Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {txn.items.map((item, idx) => (
                                <tr key={idx} className="text-gray-600">
                                  <td className="py-1">{item.product.name}</td>
                                  <td className="py-1 font-mono">{item.product.sku}</td>
                                  <td className="py-1 text-right">{item.quantity}</td>
                                  <td className="py-1 text-right font-mono">{formatINR(item.ratePerUnit)}</td>
                                  <td className="py-1 text-right font-mono">{formatINR(item.quantity * parseFloat(item.ratePerUnit))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>

        {data && data.pagination.totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-sm">
            <span className="text-gray-500">Page {data.pagination.page} of {data.pagination.totalPages}</span>
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
