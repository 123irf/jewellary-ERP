'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { formatINR } from '@/lib/format';

interface PricePreview {
  netWeight: string;
  goldRate: string;
  goldValue: string;
  wastageCost: string;
  makingCost: string;
  stoneCost: string;
  sellingPrice: string;
}

export default function CreateProductPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [vendors, setVendors] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [pricePreview, setPricePreview] = useState<PricePreview | null>(null);
  const [priceWarning, setPriceWarning] = useState('');

  // Form state
  const [form, setForm] = useState({
    name: '',
    categoryId: '',
    grossWeight: '',
    stoneWeight: '0',
    wastagePct: '',
    makingChargesPct: '0',
    goldPurity: 'K22',
    stoneRatePerCt: '',
    vendorId: '',
    purchasePrice: '',
    barcode: '',
    initialStock: '1',
    reorderLevel: '2',
  });

  useEffect(() => {
    apiFetch<Array<{ id: string; name: string }>>('/inventory/categories').then(setCategories).catch(() => {});
    apiFetch<{ items: Array<{ id: string; name: string; code: string }> }>('/vendors', { params: { pageSize: 100 } })
      .then((res) => setVendors(res.items))
      .catch(() => {});
  }, []);

  // Live price preview
  useEffect(() => {
    const gw = parseFloat(form.grossWeight);
    const sw = parseFloat(form.stoneWeight);
    const wp = parseFloat(form.wastagePct);
    const mp = parseFloat(form.makingChargesPct);

    if (!gw || gw <= sw || isNaN(wp)) {
      setPricePreview(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch<PricePreview | { sellingPrice: null; warning: string }>(
          '/inventory/products/preview-price',
          {
            method: 'POST',
            body: JSON.stringify({
              grossWeight: gw,
              stoneWeight: sw || 0,
              wastagePct: wp,
              makingChargesPct: mp || 0,
              goldPurity: form.goldPurity,
              stoneRatePerCt: form.stoneRatePerCt ? parseFloat(form.stoneRatePerCt) : undefined,
            }),
          },
        );

        if ('warning' in data) {
          setPriceWarning((data as any).warning);
          setPricePreview(null);
        } else {
          setPriceWarning('');
          setPricePreview(data as PricePreview);
        }
      } catch {
        setPricePreview(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [form.grossWeight, form.stoneWeight, form.wastagePct, form.makingChargesPct, form.goldPurity, form.stoneRatePerCt]);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const body = {
        name: form.name,
        categoryId: form.categoryId,
        grossWeight: parseFloat(form.grossWeight),
        stoneWeight: parseFloat(form.stoneWeight) || 0,
        wastagePct: parseFloat(form.wastagePct),
        makingChargesPct: parseFloat(form.makingChargesPct) || 0,
        goldPurity: form.goldPurity,
        stoneRatePerCt: form.stoneRatePerCt ? parseFloat(form.stoneRatePerCt) : undefined,
        vendorId: form.vendorId,
        purchasePrice: parseFloat(form.purchasePrice),
        barcode: form.barcode || undefined,
        initialStock: parseInt(form.initialStock) || 0,
        reorderLevel: parseInt(form.reorderLevel) || 2,
      };

      const product = await apiFetch<{ id: string }>('/inventory/products', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      router.push(`/inventory/${product.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create product');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add New Product</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* Left column — form fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
              <input type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} required minLength={2} maxLength={120} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select value={form.categoryId} onChange={(e) => updateField('categoryId', e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gross Weight (g) *</label>
                <input type="number" step="0.001" min="0.001" value={form.grossWeight} onChange={(e) => updateField('grossWeight', e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stone Weight (g)</label>
                <input type="number" step="0.001" min="0" value={form.stoneWeight} onChange={(e) => updateField('stoneWeight', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gold Purity *</label>
              <select value={form.goldPurity} onChange={(e) => updateField('goldPurity', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="K24">24K</option>
                <option value="K22">22K</option>
                <option value="K18">18K</option>
                <option value="K14">14K</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Wastage % *</label>
                <input type="number" step="0.01" min="0" max="50" value={form.wastagePct} onChange={(e) => updateField('wastagePct', e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Making Charges %</label>
                <input type="number" step="0.01" min="0" max="30" value={form.makingChargesPct} onChange={(e) => updateField('makingChargesPct', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stone Rate per Ct</label>
              <input type="number" step="0.01" min="0" value={form.stoneRatePerCt} onChange={(e) => updateField('stoneRatePerCt', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Optional" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
              <select value={form.vendorId} onChange={(e) => updateField('vendorId', e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="">Select vendor</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price *</label>
              <input type="number" step="0.01" min="0.01" value={form.purchasePrice} onChange={(e) => updateField('purchasePrice', e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
              <input type="text" value={form.barcode} onChange={(e) => updateField('barcode', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Scan or enter barcode" autoFocus />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Initial Stock *</label>
                <input type="number" min="0" value={form.initialStock} onChange={(e) => updateField('initialStock', e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
                <input type="number" min="0" value={form.reorderLevel} onChange={(e) => updateField('reorderLevel', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
            </div>
          </div>

          {/* Right column — price preview */}
          <div>
            <div className="bg-white border border-gray-200 rounded-lg p-6 sticky top-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase mb-4">Price Preview</h3>

              {priceWarning && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded text-sm mb-4">
                  {priceWarning}
                </div>
              )}

              {pricePreview ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Net Weight</span>
                    <span>{pricePreview.netWeight} g</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Gold Rate</span>
                    <span>{formatINR(pricePreview.goldRate)}/g</span>
                  </div>
                  <hr />
                  <div className="flex justify-between">
                    <span className="text-gray-500">Gold Value</span>
                    <span>{formatINR(pricePreview.goldValue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Wastage</span>
                    <span>{formatINR(pricePreview.wastageCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Making Charges</span>
                    <span>{formatINR(pricePreview.makingCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Stone Cost</span>
                    <span>{formatINR(pricePreview.stoneCost)}</span>
                  </div>
                  <hr />
                  <div className="flex justify-between text-lg font-bold text-gold-700">
                    <span>Selling Price</span>
                    <span>{formatINR(pricePreview.sellingPrice)}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">GST applied at billing, not included here.</p>
                </div>
              ) : (
                <p className="text-gray-400 text-sm">Fill in weight, purity, and wastage to see live price preview.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-gold-600 text-white px-6 py-2 rounded-md hover:bg-gold-700 font-medium text-sm disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Product'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
