'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/format';

interface GoldRate {
  id: string;
  purity: string;
  ratePerGm: string;
  effectiveFrom: string;
  user: { id: string; name: string };
}

export default function GoldRatePage() {
  const [rates, setRates] = useState<GoldRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [purity, setPurity] = useState('K22');
  const [ratePerGm, setRatePerGm] = useState('');

  function fetchRates() {
    setLoading(true);
    apiFetch<GoldRate[]>('/inventory/gold-rate')
      .then(setRates)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchRates(); }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      await apiFetch('/inventory/gold-rate', {
        method: 'POST',
        body: JSON.stringify({
          purity,
          ratePerGm: parseFloat(ratePerGm),
        }),
      });
      setSuccess(`Gold rate for ${purity} updated successfully`);
      setRatePerGm('');
      fetchRates();
    } catch (err: any) {
      setError(err.message || 'Failed to set gold rate');
    } finally {
      setSaving(false);
    }
  }

  // Group latest rate per purity for the summary cards
  const latestByPurity: Record<string, GoldRate> = {};
  for (const rate of rates) {
    if (!latestByPurity[rate.purity]) {
      latestByPurity[rate.purity] = rate;
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Gold Rate Management</h1>

      {/* Current Rates Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {['K24', 'K22', 'K18', 'K14'].map((p) => {
          const rate = latestByPurity[p];
          return (
            <div key={p} className="bg-white rounded-lg shadow p-4">
              <div className="text-xs text-gray-500 font-medium uppercase">{p.replace('K', '')}K Gold</div>
              <div className="text-xl font-bold text-gold-700 mt-1">
                {rate ? formatINR(rate.ratePerGm) : '--'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {rate ? `per gram | ${formatDate(rate.effectiveFrom)}` : 'No rate set'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Set Rate Form */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase mb-4">Update Gold Rate</h2>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm mb-4">{success}</div>}

        <form onSubmit={handleSubmit} className="flex gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Purity</label>
            <select value={purity} onChange={(e) => setPurity(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
              <option value="K24">24K</option>
              <option value="K22">22K</option>
              <option value="K18">18K</option>
              <option value="K14">14K</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Rate per gram (INR)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={ratePerGm}
              onChange={(e) => setRatePerGm(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="e.g. 6875.00"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-gold-600 text-white px-6 py-2 rounded-md hover:bg-gold-700 font-medium text-sm disabled:opacity-50"
          >
            {saving ? 'Setting...' : 'Set Rate'}
          </button>
        </form>
      </div>

      {/* Rate History */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-500 uppercase">Rate History</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purity</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate / gram</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Effective From</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Set By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : (
              rates.map((rate) => (
                <tr key={rate.id}>
                  <td className="px-4 py-3 text-sm font-medium">{rate.purity.replace('K', '')}K</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{formatINR(rate.ratePerGm)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(rate.effectiveFrom)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{rate.user.name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
