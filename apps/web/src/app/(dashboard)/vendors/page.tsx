'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatINR } from '@/lib/format';

interface Vendor {
  id: string;
  code: string;
  name: string;
  phone: string;
  runningBalance: string;
  isActive: boolean;
}

export default function VendorListPage() {
  const [data, setData] = useState<{ items: Vendor[]; pagination: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasBalance, setHasBalance] = useState(false);

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ items: Vendor[]; pagination: any }>('/vendors', {
        params: { q: search || undefined, hasBalance: hasBalance || undefined, page, pageSize: 20 },
      });
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search, page, hasBalance]);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        <Link href="/vendors/new" className="bg-gold-600 text-white px-4 py-2 rounded-md hover:bg-gold-700 font-medium text-sm">
          + Add Vendor
        </Link>
      </div>

      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Search by name, code, or phone..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={hasBalance} onChange={(e) => { setHasBalance(e.target.checked); setPage(1); }} className="rounded" />
          With balance only
        </label>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : data?.items.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No vendors found</td></tr>
            ) : (
              data?.items.map((v) => {
                const balance = parseFloat(v.runningBalance);
                return (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono">
                      <Link href={`/vendors/${v.id}`} className="text-gold-700 hover:underline">{v.code}</Link>
                    </td>
                    <td className="px-4 py-3 text-sm">{v.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{v.phone}</td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${
                      balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {formatINR(v.runningBalance)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {data && data.pagination.totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} vendors)
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
