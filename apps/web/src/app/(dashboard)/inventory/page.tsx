'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatINR, formatWeight } from '@/lib/format';

interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  goldPurity: string;
  grossWeight: string;
  netWeight: string;
  currentStock: number;
  reorderLevel: number;
  isActive: boolean;
  sellingPrice: string | null;
  category: { id: string; name: string };
  vendor: { id: string; name: string; code: string };
}

interface ProductListResponse {
  items: Product[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export default function InventoryListPage() {
  const [data, setData] = useState<ProductListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<ProductListResponse>('/inventory/products', {
        params: {
          q: search || undefined,
          categoryId: categoryId || undefined,
          page,
          pageSize: 20,
        },
      });
      setData(result);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  }, [search, page, categoryId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    apiFetch<Array<{ id: string; name: string }>>('/inventory/categories').then(setCategories).catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
        <Link
          href="/inventory/new"
          className="bg-gold-600 text-white px-4 py-2 rounded-md hover:bg-gold-700 font-medium text-sm"
        >
          + Add Product
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Search by name, SKU, or barcode..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
        />
        <select
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purity</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Wt</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No products found</td>
              </tr>
            ) : (
              data?.items.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono">
                    <Link href={`/inventory/${product.id}`} className="text-gold-700 hover:underline">
                      {product.sku}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">{product.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{product.category.name}</td>
                  <td className="px-4 py-3 text-sm">{product.goldPurity}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatWeight(product.netWeight)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">
                    {product.sellingPrice ? formatINR(product.sellingPrice) : (
                      <span className="text-amber-600 text-xs">No rate set</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span
                      className={
                        product.currentStock <= product.reorderLevel
                          ? 'text-red-600 font-semibold'
                          : 'text-gray-900'
                      }
                    >
                      {product.currentStock}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Showing {((data.pagination.page - 1) * data.pagination.pageSize) + 1}–
              {Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)} of {data.pagination.total}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
