'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface LowStockProduct {
  id: string;
  sku: string;
  name: string;
  currentStock: number;
  reorderLevel: number;
  categoryName: string;
  categoryCode: string;
  goldPurity: string;
}

export default function LowStockPage() {
  const [products, setProducts] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<LowStockProduct[]>('/inventory/low-stock')
      .then(setProducts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Low Stock Alerts</h1>
          <span className="bg-red-100 text-red-700 text-sm font-semibold px-2.5 py-0.5 rounded-full">
            {products.length}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purity</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Reorder At</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Deficit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-green-600">All products are above reorder level!</td></tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="hover:bg-red-50">
                  <td className="px-4 py-3 text-sm font-mono">
                    <Link href={`/inventory/${p.id}`} className="text-gold-700 hover:underline">{p.sku}</Link>
                  </td>
                  <td className="px-4 py-3 text-sm">{p.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.categoryName}</td>
                  <td className="px-4 py-3 text-sm">{p.goldPurity}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-red-600 font-semibold">{p.currentStock}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{p.reorderLevel}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-red-600">
                    {p.reorderLevel - p.currentStock}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
