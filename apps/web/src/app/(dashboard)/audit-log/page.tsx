'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; name: string; role: string };
}

interface AuditResponse {
  rows: AuditRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export default function AuditLogPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  // Expanded row for viewing before/after JSON
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number | undefined> = { page, pageSize: 30 };
      if (entity) params.entity = entity;
      if (action) params.action = action;
      if (from) params.from = from;
      if (to) params.to = to;

      const result = await apiFetch<AuditResponse>('/audit-log', { params });
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [entity, action, from, to, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Audit Log</h1>

      {/* Filters */}
      <form onSubmit={handleFilter} className="mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Entity</label>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          >
            <option value="">All</option>
            <option value="User">User</option>
            <option value="Product">Product</option>
            <option value="Vendor">Vendor</option>
            <option value="VendorTransaction">VendorTransaction</option>
            <option value="Sale">Sale</option>
            <option value="CustomerDue">CustomerDue</option>
            <option value="StockMovement">StockMovement</option>
            <option value="GoldRate">GoldRate</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. LOGIN"
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-36"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <button type="submit" className="bg-gray-800 text-white px-4 py-1.5 rounded-md text-sm font-medium">
          Filter
        </button>
        <button
          type="button"
          onClick={() => { setEntity(''); setAction(''); setFrom(''); setTo(''); setPage(1); }}
          className="text-sm text-gray-500 hover:underline"
        >
          Clear
        </button>
      </form>

      {error && <div className="mb-4 text-red-600 text-sm">{error}</div>}

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : data ? (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Timestamp</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Entity</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Entity ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">IP</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <>
                    <tr key={row.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {new Date(row.createdAt).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-2 text-gray-700">{row.user.name}</td>
                      <td className="px-4 py-2">
                        <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-medium">
                          {row.action}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{row.entity}</td>
                      <td className="px-4 py-2 text-gray-400 font-mono text-xs truncate max-w-[120px]">
                        {row.entityId}
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{row.ipAddress || '-'}</td>
                      <td className="px-4 py-2 text-right">
                        {(row.before || row.after) && (
                          <button
                            onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {expandedId === row.id ? 'Hide' : 'View'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr key={`${row.id}-detail`} className="bg-gray-50">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            {row.before && (
                              <div>
                                <div className="font-semibold text-gray-600 mb-1">Before</div>
                                <pre className="bg-white border border-gray-200 rounded p-2 overflow-auto max-h-40">
                                  {JSON.stringify(row.before, null, 2)}
                                </pre>
                              </div>
                            )}
                            {row.after && (
                              <div>
                                <div className="font-semibold text-gray-600 mb-1">After</div>
                                <pre className="bg-white border border-gray-200 rounded p-2 overflow-auto max-h-40">
                                  {JSON.stringify(row.after, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      No audit log entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
              <span>
                Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} entries)
              </span>
              <div className="space-x-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
