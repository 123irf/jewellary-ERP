'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    grossWeight: '',
    stoneWeight: '',
    wastagePct: '',
    makingChargesPct: '',
    goldPurity: '',
    stoneRatePerCt: '',
    purchasePrice: '',
    barcode: '',
    reorderLevel: '',
  });

  useEffect(() => {
    apiFetch<any>(`/inventory/products/${id}`)
      .then((p) => {
        setForm({
          name: p.name,
          grossWeight: p.grossWeight,
          stoneWeight: p.stoneWeight,
          wastagePct: p.wastagePct,
          makingChargesPct: p.makingChargesPct,
          goldPurity: p.goldPurity,
          stoneRatePerCt: p.stoneRatePerCt || '',
          purchasePrice: p.purchasePrice,
          barcode: p.barcode || '',
          reorderLevel: String(p.reorderLevel),
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const body: Record<string, unknown> = {
        name: form.name,
        grossWeight: parseFloat(form.grossWeight),
        stoneWeight: parseFloat(form.stoneWeight),
        wastagePct: parseFloat(form.wastagePct),
        makingChargesPct: parseFloat(form.makingChargesPct),
        goldPurity: form.goldPurity,
        stoneRatePerCt: form.stoneRatePerCt ? parseFloat(form.stoneRatePerCt) : null,
        barcode: form.barcode || null,
        reorderLevel: parseInt(form.reorderLevel),
      };

      // Only ADMIN can edit purchase price
      if (user?.role === 'ADMIN') {
        body.purchasePrice = parseFloat(form.purchasePrice);
      }

      await apiFetch(`/inventory/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      router.push(`/inventory/${id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update product');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Product</h1>

      {user?.role === 'ADMIN' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded text-sm mb-6">
          You are editing as ADMIN. All changes will be recorded in the audit log.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
          <input type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gross Weight (g)</label>
            <input type="number" step="0.001" value={form.grossWeight} onChange={(e) => updateField('grossWeight', e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stone Weight (g)</label>
            <input type="number" step="0.001" value={form.stoneWeight} onChange={(e) => updateField('stoneWeight', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gold Purity</label>
          <select value={form.goldPurity} onChange={(e) => updateField('goldPurity', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
            <option value="K24">24K</option>
            <option value="K22">22K</option>
            <option value="K18">18K</option>
            <option value="K14">14K</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Wastage %</label>
            <input type="number" step="0.01" value={form.wastagePct} onChange={(e) => updateField('wastagePct', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Making Charges %</label>
            <input type="number" step="0.01" value={form.makingChargesPct} onChange={(e) => updateField('makingChargesPct', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Purchase Price
            {user?.role === 'STAFF' && <span className="text-gray-400 ml-1">(locked for STAFF)</span>}
          </label>
          <input
            type="number"
            step="0.01"
            value={form.purchasePrice}
            onChange={(e) => updateField('purchasePrice', e.target.value)}
            disabled={user?.role === 'STAFF'}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100 disabled:text-gray-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
          <input type="text" value={form.barcode} onChange={(e) => updateField('barcode', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
          <input type="number" min="0" value={form.reorderLevel} onChange={(e) => updateField('reorderLevel', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>

        <div className="flex gap-3 pt-4">
          <button type="submit" disabled={saving} className="bg-gold-600 text-white px-6 py-2 rounded-md hover:bg-gold-700 font-medium text-sm disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => router.back()} className="px-6 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
