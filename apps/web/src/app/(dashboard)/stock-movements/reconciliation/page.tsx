'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface ReconciliationData {
  healthy: boolean;
  driftCount: number;
  items: Array<{
    id: string;
    name: string;
    sku: string;
    currentStock: number;
    computedStock: number;
    drift: number;
  }>;
}

interface RunResult {
  checkedAt: string;
  correctionCount: number;
  corrections: Array<{ productId: string; sku: string; drift: number }>;
}

export default function ReconciliationPage() {
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);

  function loadData() {
    setLoading(true);
    setError('');
    apiFetch<ReconciliationData>('/stock-movements/reconciliation')
      .then(setData)
      .catch((err: any) => setError(err.message || 'Failed to load reconciliation data'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  async function handleRunReconciliation() {
    if (!confirm('This will create AUDIT_CORRECTION movements for any drifted products. Continue?')) return;
    setRunning(true);
    setRunResult(null);
    try {
      const result = await apiFetch<RunResult>('/stock-movements/reconciliation/run', { method: 'POST' });
      setRunResult(result);
      loadData(); // Refresh the health check
    } catch (err: any) {
      setError(err.message || 'Reconciliation run failed');
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (error && !data) return <div className="text-center py-12 text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/stock-movements" className="text-sm text-gray-500 hover:text-gray-700">&larr; Back to Stock Movements</Link>
          <h1 className="text-2xl font-bold text-gray-900">Reconciliation Health Check</h1>
        </div>
        <button
          onClick={handleRunReconciliation}
          disabled={running}
          className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run Reconciliation Now'}
        </button>
      </div>

      {/* Run result toast */}
      {runResult && (
        <div className={`rounded-lg px-4 py-3 mb-4 text-sm ${
          runResult.correctionCount === 0 ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
        }`}>
          {runResult.correctionCount === 0
            ? 'Reconciliation complete — no corrections needed.'
            : `Reconciliation complete — ${runResult.correctionCount} correction(s) applied.`}
        </div>
      )}

      {error && <div className="text-center py-2 text-red-600 text-sm mb-4">{error}</div>}

      {data && (
        <>
          {/* Health status card */}
          <div className={`rounded-lg shadow px-6 py-4 mb-6 ${data.healthy ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{data.healthy ? '\u2705' : '\u274C'}</span>
              <div>
                <div className={`text-lg font-bold ${data.healthy ? 'text-green-800' : 'text-red-800'}`}>
                  {data.healthy ? 'System Healthy' : `Drift Detected — ${data.driftCount} product(s)`}
                </div>
                <div className="text-sm text-gray-600">
                  {data.healthy
                    ? 'All product stock caches match the movement log. No corrections needed.'
                    : 'Product.currentStock does not match SUM(StockMovement.quantityDelta) for the products below.'}
                </div>
              </div>
            </div>
          </div>

          {/* Drifted products table */}
          {!data.healthy && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cached Stock</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Computed Stock</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Drift</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.items.map((item) => (
                    <tr key={item.id} className="bg-red-50">
                      <td className="px-4 py-3 text-sm">
                        <Link href={`/inventory/${item.id}`} className="text-gold-700 hover:underline font-medium">
                          {item.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 font-mono">{item.sku}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">{item.currentStock}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">{item.computedStock}</td>
                      <td className={`px-4 py-3 text-sm text-right font-mono font-bold ${item.drift > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.drift > 0 ? '+' : ''}{item.drift}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
