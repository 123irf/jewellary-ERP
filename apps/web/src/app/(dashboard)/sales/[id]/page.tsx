'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/format';
import { useAuthStore } from '@/store/auth';

interface SaleDetail {
  id: string;
  invoiceNumber: string;
  customerWalkIn: boolean;
  subtotal: string;
  totalDiscount: string;
  taxableAmount: string;
  cgst: string;
  sgst: string;
  igst: string;
  grandTotal: string;
  amountPaid: string;
  creditAmount: string;
  status: string;
  notes: string | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string } | null;
  createdBy: { id: string; name: string };
  items: Array<{
    id: string;
    productName: string;
    sku: string;
    goldPurity: string;
    goldRateAtSale: string;
    netWeight: string;
    quantity: number;
    unitPrice: string;
    lineDiscount: string;
    lineTotal: string;
  }>;
  payments: Array<{
    id: string;
    mode: string;
    amount: string;
    reference: string | null;
    createdAt: string;
  }>;
  movements: Array<{
    id: string;
    type: string;
    quantityDelta: number;
    stockAfter: number;
    product: { id: string; name: string };
  }>;
  due: {
    id: string;
    originalAmount: string;
    paidAmount: string;
    balanceAmount: string;
    status: string;
  } | null;
}

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState(false);
  const [error, setError] = useState('');
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    apiFetch<SaleDetail>(`/sales/${id}`)
      .then(setSale)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  async function handleVoid() {
    if (!confirm('Are you sure you want to void this sale? Stock will be reversed and any credit due will be cancelled.')) return;
    setVoiding(true);
    setError('');
    try {
      const result = await apiFetch<SaleDetail>(`/sales/${id}/void`, { method: 'POST' });
      setSale(result);
    } catch (err: any) {
      setError(err.message || 'Failed to void sale');
    } finally {
      setVoiding(false);
    }
  }

  if (loading) return <div className="text-gray-500">Loading...</div>;
  if (!sale) return <div className="text-red-600">Sale not found</div>;

  const isVoided = sale.status === 'VOIDED';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{sale.invoiceNumber}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              isVoided ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}>
              {sale.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {formatDate(sale.createdAt)} by {sale.createdBy.name}
          </p>
        </div>
        <div className="flex gap-2">
          {user?.role === 'ADMIN' && !isVoided && (
            <button
              onClick={handleVoid}
              disabled={voiding}
              className="px-4 py-2 border border-red-300 text-red-700 rounded-md text-sm hover:bg-red-50 disabled:opacity-50"
            >
              {voiding ? 'Voiding...' : 'Void Sale'}
            </button>
          )}
          <Link href="/sales" className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50">
            Back to Sales
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Customer Info */}
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Customer</h3>
          {sale.customerWalkIn ? (
            <div className="text-gray-400">Walk-in customer</div>
          ) : sale.customer ? (
            <div>
              <div className="font-medium">{sale.customer.name}</div>
              <div className="text-sm text-gray-500">{sale.customer.phone}</div>
              <Link href={`/customers/${sale.customer.id}`} className="text-xs text-gold-700 hover:underline mt-1 block">
                View profile
              </Link>
            </div>
          ) : (
            <div className="text-gray-400">No customer</div>
          )}
        </div>

        {/* Payment Summary */}
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Payment</h3>
          <div className="text-xl font-bold text-gold-700">{formatINR(sale.grandTotal)}</div>
          <div className="text-sm text-gray-500 mt-1">
            Paid: {formatINR(sale.amountPaid)}
            {parseFloat(sale.creditAmount) > 0 && (
              <span className="text-amber-600 ml-2">Credit: {formatINR(sale.creditAmount)}</span>
            )}
          </div>
        </div>

        {/* Due Status */}
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Due</h3>
          {sale.due ? (
            <div>
              <div className={`text-xl font-bold ${
                sale.due.status === 'CLEARED' ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatINR(sale.due.balanceAmount)}
              </div>
              <div className="text-sm text-gray-500">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                  sale.due.status === 'PENDING' ? 'bg-red-100 text-red-700'
                    : sale.due.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700'
                    : sale.due.status === 'CLEARED' ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>{sale.due.status}</span>
                <span className="ml-2">of {formatINR(sale.due.originalAmount)}</span>
              </div>
              <Link href={`/dues/${sale.due.id}`} className="text-xs text-gold-700 hover:underline mt-1 block">
                View due details
              </Link>
            </div>
          ) : (
            <div className="text-green-600 font-medium">Fully paid</div>
          )}
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-500 uppercase">Items</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purity</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gold Rate</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weight</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Qty</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Discount</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-sm">
                  <div className="font-medium">{item.productName}</div>
                  <div className="text-xs text-gray-400 font-mono">{item.sku}</div>
                </td>
                <td className="px-4 py-3 text-sm">{item.goldPurity}</td>
                <td className="px-4 py-3 text-sm text-right font-mono">{formatINR(item.goldRateAtSale)}/g</td>
                <td className="px-4 py-3 text-sm text-right font-mono">{item.netWeight}g</td>
                <td className="px-4 py-3 text-sm text-right font-mono">{formatINR(item.unitPrice)}</td>
                <td className="px-4 py-3 text-sm text-center">{item.quantity}</td>
                <td className="px-4 py-3 text-sm text-right font-mono text-green-600">
                  {parseFloat(item.lineDiscount) > 0 ? `-${formatINR(item.lineDiscount)}` : '--'}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono font-medium">{formatINR(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <div className="w-64 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-mono">{formatINR(sale.subtotal)}</span></div>
            {parseFloat(sale.totalDiscount) > 0 && (
              <div className="flex justify-between text-green-600"><span>Discount</span><span className="font-mono">-{formatINR(sale.totalDiscount)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-gray-500">Taxable</span><span className="font-mono">{formatINR(sale.taxableAmount)}</span></div>
            {parseFloat(sale.cgst) > 0 && <div className="flex justify-between text-xs text-gray-500"><span>CGST</span><span className="font-mono">{formatINR(sale.cgst)}</span></div>}
            {parseFloat(sale.sgst) > 0 && <div className="flex justify-between text-xs text-gray-500"><span>SGST</span><span className="font-mono">{formatINR(sale.sgst)}</span></div>}
            {parseFloat(sale.igst) > 0 && <div className="flex justify-between text-xs text-gray-500"><span>IGST</span><span className="font-mono">{formatINR(sale.igst)}</span></div>}
            <hr />
            <div className="flex justify-between text-lg font-bold text-gold-700"><span>Grand Total</span><span className="font-mono">{formatINR(sale.grandTotal)}</span></div>
          </div>
        </div>
      </div>

      {/* Payments */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-500 uppercase">Payments</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mode</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sale.payments.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    p.mode === 'CREDIT' ? 'bg-amber-100 text-amber-700'
                      : p.mode === 'CASH' ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>{p.mode}</span>
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono">{formatINR(p.amount)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{p.reference || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stock Movements */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-500 uppercase">Stock Movements</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Delta</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sale.movements.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 text-sm">{m.product.name}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    m.type === 'VOID_REVERSAL' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                  }`}>{m.type}</span>
                </td>
                <td className={`px-4 py-3 text-sm text-right font-mono ${m.quantityDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {m.quantityDelta > 0 ? '+' : ''}{m.quantityDelta}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono">{m.stockAfter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
