'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatINR, formatWeight, formatDate } from '@/lib/format';
import { useAuthStore } from '@/store/auth';

interface ProductDetail {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  goldPurity: string;
  grossWeight: string;
  netWeight: string;
  stoneWeight: string;
  wastagePct: string;
  makingChargesPct: string;
  stoneRatePerCt: string | null;
  purchasePrice: string;
  currentStock: number;
  reorderLevel: number;
  isActive: boolean;
  sellingPrice: string | null;
  priceBreakdown: {
    goldValue: string;
    wastageCost: string;
    makingCost: string;
    stoneCost: string;
    goldRate: string;
  } | null;
  category: { id: string; name: string };
  vendor: { id: string; name: string; code: string };
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  movements: Array<{
    id: string;
    type: string;
    quantityDelta: number;
    stockAfter: number;
    notes: string | null;
    createdAt: string;
    createdBy: { id: string; name: string };
  }>;
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    apiFetch<ProductDetail>(`/inventory/products/${id}`)
      .then(setProduct)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-gray-500">Loading...</div>;
  if (!product) return <div className="text-red-600">Product not found</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
            {!product.isActive && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">Inactive</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1 font-mono">{product.sku}{product.barcode ? ` | ${product.barcode}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/inventory/${product.id}/edit`}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
          >
            Edit
          </Link>
          <Link
            href={`/inventory/${product.id}/timeline`}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
          >
            Timeline
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Product Info */}
        <div className="bg-white rounded-lg shadow p-6 col-span-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase mb-4">Product Details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-gray-500">Category</dt>
              <dd className="font-medium">{product.category.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Gold Purity</dt>
              <dd className="font-medium">{product.goldPurity}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Gross Weight</dt>
              <dd className="font-medium">{formatWeight(product.grossWeight)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Net Weight</dt>
              <dd className="font-medium">{formatWeight(product.netWeight)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Stone Weight</dt>
              <dd className="font-medium">{formatWeight(product.stoneWeight)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Wastage %</dt>
              <dd className="font-medium">{product.wastagePct}%</dd>
            </div>
            <div>
              <dt className="text-gray-500">Making Charges %</dt>
              <dd className="font-medium">{product.makingChargesPct}%</dd>
            </div>
            <div>
              <dt className="text-gray-500">Stone Rate / Ct</dt>
              <dd className="font-medium">{product.stoneRatePerCt ? formatINR(product.stoneRatePerCt) : 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Purchase Price</dt>
              <dd className="font-medium">{formatINR(product.purchasePrice)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Vendor</dt>
              <dd className="font-medium">{product.vendor.name} ({product.vendor.code})</dd>
            </div>
            <div>
              <dt className="text-gray-500">Current Stock</dt>
              <dd className={`font-medium ${product.currentStock <= product.reorderLevel ? 'text-red-600' : ''}`}>
                {product.currentStock} (reorder at {product.reorderLevel})
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Created By</dt>
              <dd className="font-medium">{product.createdBy.name} on {formatDate(product.createdAt)}</dd>
            </div>
          </dl>
        </div>

        {/* Price Breakdown Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase mb-4">Price Breakdown</h2>
          {product.priceBreakdown ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Gold Rate</span>
                <span>{formatINR(product.priceBreakdown.goldRate)}/g</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Gold Value</span>
                <span>{formatINR(product.priceBreakdown.goldValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Wastage</span>
                <span>{formatINR(product.priceBreakdown.wastageCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Making</span>
                <span>{formatINR(product.priceBreakdown.makingCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Stone</span>
                <span>{formatINR(product.priceBreakdown.stoneCost)}</span>
              </div>
              <hr />
              <div className="flex justify-between text-lg font-bold text-gold-700">
                <span>Selling Price</span>
                <span>{formatINR(product.sellingPrice)}</span>
              </div>
              <p className="text-xs text-gray-400">Excl. GST. Tax applied at POS.</p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded text-sm">
              No gold rate set for {product.goldPurity}. Set gold rate first.
            </div>
          )}
        </div>
      </div>

      {/* Recent Stock Movements */}
      <div className="mt-6 bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase">Recent Stock Movements</h2>
          <Link href={`/inventory/${product.id}/timeline`} className="text-sm text-gold-700 hover:underline">
            View all
          </Link>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Delta</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">After</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">By</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {product.movements.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No movements yet</td>
              </tr>
            ) : (
              product.movements.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(m.createdAt)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      m.type.includes('ADJUSTMENT') || m.type === 'DAMAGE'
                        ? 'bg-amber-100 text-amber-700'
                        : m.quantityDelta > 0
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                    }`}>
                      {m.type}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-mono ${m.quantityDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {m.quantityDelta > 0 ? '+' : ''}{m.quantityDelta}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{m.stockAfter}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{m.createdBy.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{m.notes || '--'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
