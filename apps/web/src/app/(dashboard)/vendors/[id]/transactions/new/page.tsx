'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { useAuthStore } from '@/store/auth';

interface ProductOption {
  id: string;
  sku: string;
  name: string;
}

const TYPES_WITH_ITEMS = ['PURCHASE', 'RETURN'];
const ALL_TYPES = [
  { value: 'PURCHASE', label: 'Purchase (stock in)' },
  { value: 'RETURN', label: 'Return (stock out)' },
  { value: 'PAYMENT', label: 'Payment' },
  { value: 'ADVANCE', label: 'Advance' },
  { value: 'CREDIT_NOTE', label: 'Credit Note' },
  { value: 'DEBIT_NOTE', label: 'Debit Note' },
  { value: 'ADJUSTMENT', label: 'Adjustment (ADMIN only)' },
];

interface ItemRow {
  productId: string;
  quantity: string;
  ratePerUnit: string;
}

export default function NewTransactionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [products, setProducts] = useState<ProductOption[]>([]);

  useEffect(() => {
    apiFetch<{ items: Array<{ id: string; sku: string; name: string }> }>('/inventory/products', { params: { pageSize: 100 } })
      .then((res) => setProducts(res.items))
      .catch(() => {});
  }, []);
  const [txnType, setTxnType] = useState('PURCHASE');
  const [amount, setAmount] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [direction, setDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [items, setItems] = useState<ItemRow[]>([{ productId: '', quantity: '1', ratePerUnit: '' }]);

  const needsItems = TYPES_WITH_ITEMS.includes(txnType);
  const isAdjustment = txnType === 'ADJUSTMENT';

  // Auto-compute amount from items
  const computedTotal = items.reduce((sum, item) => {
    const qty = parseInt(item.quantity) || 0;
    const rate = parseFloat(item.ratePerUnit) || 0;
    return sum + qty * rate;
  }, 0);

  function addItem() {
    setItems((prev) => [...prev, { productId: '', quantity: '1', ratePerUnit: '' }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const finalAmount = needsItems ? computedTotal : parseFloat(amount);
      if (!finalAmount || finalAmount <= 0) {
        setError('Amount must be > 0');
        setLoading(false);
        return;
      }

      const body: Record<string, unknown> = {
        txnType,
        amount: finalAmount,
        referenceNo: referenceNo || undefined,
        notes: notes || undefined,
      };

      if (isAdjustment) body.direction = direction;

      if (needsItems) {
        body.items = items.map((item) => ({
          productId: item.productId,
          quantity: parseInt(item.quantity),
          ratePerUnit: parseFloat(item.ratePerUnit),
        }));
      }

      await apiFetch(`/vendors/${id}/transactions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      router.push(`/vendors/${id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create transaction');
    } finally {
      setLoading(false);
    }
  }

  const availableTypes = ALL_TYPES.filter((t) => t.value !== 'ADJUSTMENT' || user?.role === 'ADMIN');

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Vendor Transaction</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type *</label>
          <select value={txnType} onChange={(e) => setTxnType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
            {availableTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Items section — only for PURCHASE/RETURN */}
        {needsItems && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Items</h3>
              <button type="button" onClick={addItem} className="text-sm text-gold-700 hover:underline">+ Add item</button>
            </div>
            {items.map((item, i) => (
              <div key={i} className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Product</label>
                  <select value={item.productId} onChange={(e) => updateItem(i, 'productId', e.target.value)} required className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                    <option value="">Select product</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                  </select>
                </div>
                <div className="w-20">
                  <label className="block text-xs text-gray-500 mb-1">Qty</label>
                  <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', e.target.value)} required className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </div>
                <div className="w-32">
                  <label className="block text-xs text-gray-500 mb-1">Rate/unit</label>
                  <input type="number" step="0.01" min="0.01" value={item.ratePerUnit} onChange={(e) => updateItem(i, 'ratePerUnit', e.target.value)} required className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </div>
                <div className="w-28 text-sm text-right font-mono pt-4">
                  {formatINR((parseInt(item.quantity) || 0) * (parseFloat(item.ratePerUnit) || 0))}
                </div>
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 pb-1">x</button>
                )}
              </div>
            ))}
            <div className="text-right text-sm font-semibold pt-2 border-t border-gray-200">
              Total: {formatINR(computedTotal)}
            </div>
          </div>
        )}

        {/* Amount — manual entry for non-item types */}
        {!needsItems && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (INR) *</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
        )}

        {/* Direction — only for ADJUSTMENT */}
        {isAdjustment && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Direction *</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value as 'CREDIT' | 'DEBIT')} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
              <option value="CREDIT">CREDIT (increase balance — we owe more)</option>
              <option value="DEBIT">DEBIT (decrease balance — we owe less)</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reference No</label>
          <input type="text" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="PO number, cheque no., etc." />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes {isAdjustment && <span className="text-red-500">*</span>}
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} required={isAdjustment} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="bg-gold-600 text-white px-6 py-2 rounded-md hover:bg-gold-700 font-medium text-sm disabled:opacity-50">
            {loading ? 'Submitting...' : 'Submit Transaction'}
          </button>
          <button type="button" onClick={() => router.back()} className="px-6 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </form>
    </div>
  );
}
