'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { formatINR } from '@/lib/format';

// ─── Types ──────────────────────────────────────────────────────

interface Product {
  id: string;
  sku: string;
  name: string;
  goldPurity: string;
  netWeight: string;
  currentStock: number;
  sellingPrice: string | null;
  category: { name: string };
}

interface CartItem {
  product: Product;
  quantity: number;
  lineDiscount: { type: 'AMOUNT' | 'PCT'; value: number } | null;
}

interface PaymentRow {
  mode: 'CASH' | 'UPI' | 'CARD' | 'CREDIT';
  amount: string;
  reference: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  totalDue: string;
}

interface PreviewResult {
  lines: Array<{
    productId: string;
    productName: string;
    sku: string;
    unitPrice: string;
    lineDiscount: string;
    lineTotal: string;
  }>;
  subtotal: string;
  totalDiscount: string;
  taxableAmount: string;
  cgst: string;
  sgst: string;
  igst: string;
  grandTotal: string;
}

// ─── Component ─────────────────────────────────────────────────

export default function POSBillingPage() {
  const router = useRouter();

  // Product search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Customer
  const [customerMode, setCustomerMode] = useState<'walkin' | 'existing' | 'new'>('walkin');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', gstin: '' });

  // Billing
  const [gstMode, setGstMode] = useState<'INTRA' | 'INTER'>('INTRA');
  const [billDiscount, setBillDiscount] = useState({ type: 'AMOUNT' as 'AMOUNT' | 'PCT', value: '' });
  const [payments, setPayments] = useState<PaymentRow[]>([{ mode: 'CASH', amount: '', reference: '' }]);
  const [notes, setNotes] = useState('');

  // Preview
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ─── Product Search ────────────────────────────────────────────

  const searchProducts = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await apiFetch<{ items: Product[] }>('/inventory/products', {
        params: { q, pageSize: 10 },
      });
      setSearchResults(res.items.filter((p) => p.currentStock > 0));
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchProducts(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchProducts]);

  // ─── Customer Search ───────────────────────────────────────────

  useEffect(() => {
    if (customerMode !== 'existing' || customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const customers = await apiFetch<Customer[]>('/customers/search', {
          params: { q: customerSearch },
        });
        setCustomerResults(customers);
      } catch { setCustomerResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, customerMode]);

  // ─── Cart Operations ──────────────────────────────────────────

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.currentStock) return prev;
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...prev, { product, quantity: 1, lineDiscount: null }];
    });
    setSearchQuery('');
    setSearchResults([]);
  }

  function updateCartQuantity(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.product.id !== productId));
    } else {
      setCart((prev) => prev.map((c) =>
        c.product.id === productId ? { ...c, quantity: Math.min(qty, c.product.currentStock) } : c,
      ));
    }
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  }

  function setLineDiscount(productId: string, type: 'AMOUNT' | 'PCT', value: string) {
    setCart((prev) => prev.map((c) =>
      c.product.id === productId
        ? { ...c, lineDiscount: value ? { type, value: parseFloat(value) } : null }
        : c,
    ));
  }

  // ─── Payment Operations ────────────────────────────────────────

  function addPayment() {
    setPayments((prev) => [...prev, { mode: 'CASH', amount: '', reference: '' }]);
  }

  function removePayment(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePayment(index: number, field: keyof PaymentRow, value: string) {
    setPayments((prev) => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  }

  // Auto-fill single payment amount from preview grandTotal
  function autoFillPayment() {
    if (preview && payments.length === 1) {
      setPayments([{ ...payments[0], amount: preview.grandTotal }]);
    }
  }

  // ─── Preview ──────────────────────────────────────────────────

  async function fetchPreview() {
    if (cart.length === 0) { setPreview(null); return; }
    setPreviewLoading(true);
    try {
      const body = buildSaleBody();
      if (!body) return;
      const result = await apiFetch<PreviewResult>('/sales/preview', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPreview(result);
    } catch (err: any) {
      setError(err.message || 'Preview failed');
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(fetchPreview, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, gstMode, billDiscount.type, billDiscount.value]);

  // ─── Build Sale Body ──────────────────────────────────────────

  function buildSaleBody() {
    if (cart.length === 0) return null;

    const items = cart.map((c) => ({
      productId: c.product.id,
      quantity: c.quantity,
      ...(c.lineDiscount ? { lineDiscount: c.lineDiscount } : {}),
    }));

    const body: Record<string, unknown> = {
      items,
      gstMode,
      payments: payments.map((p) => ({
        mode: p.mode,
        amount: parseFloat(p.amount) || 0.01, // preview needs > 0
        ...(p.reference ? { reference: p.reference } : {}),
      })),
    };

    if (billDiscount.value && parseFloat(billDiscount.value) > 0) {
      body.billDiscount = { type: billDiscount.type, value: parseFloat(billDiscount.value) };
    }

    if (customerMode === 'walkin') {
      body.walkIn = true;
    } else if (selectedCustomer) {
      body.customerId = selectedCustomer.id;
    }

    if (notes) body.notes = notes;
    return body;
  }

  // ─── Submit Sale ──────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (cart.length === 0) { setError('Cart is empty'); return; }

    // Validate customer for credit payments
    const hasCreditPayment = payments.some((p) => p.mode === 'CREDIT');
    if (hasCreditPayment && customerMode === 'walkin') {
      setError('Walk-in customers cannot use credit payment. Select or create a customer.');
      return;
    }

    // If new customer, create first
    let customerId: string | undefined;
    if (customerMode === 'existing' && selectedCustomer) {
      customerId = selectedCustomer.id;
    } else if (customerMode === 'new') {
      if (!newCustomer.name || !newCustomer.phone) {
        setError('Customer name and phone are required');
        return;
      }
      try {
        const customer = await apiFetch<{ id: string }>('/customers', {
          method: 'POST',
          body: JSON.stringify({
            name: newCustomer.name,
            phone: newCustomer.phone,
            email: newCustomer.email || undefined,
            gstin: newCustomer.gstin || undefined,
          }),
        });
        customerId = customer.id;
      } catch (err: any) {
        setError(err.message || 'Failed to create customer');
        return;
      }
    }

    // Validate payment totals
    const paymentTotal = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    if (preview && Math.abs(paymentTotal - parseFloat(preview.grandTotal)) > 0.01) {
      setError(`Payment total (${formatINR(paymentTotal)}) does not match grand total (${formatINR(preview.grandTotal)})`);
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        items: cart.map((c) => ({
          productId: c.product.id,
          quantity: c.quantity,
          ...(c.lineDiscount ? { lineDiscount: c.lineDiscount } : {}),
        })),
        gstMode,
        payments: payments.map((p) => ({
          mode: p.mode,
          amount: parseFloat(p.amount),
          ...(p.reference ? { reference: p.reference } : {}),
        })),
      };

      if (billDiscount.value && parseFloat(billDiscount.value) > 0) {
        body.billDiscount = { type: billDiscount.type, value: parseFloat(billDiscount.value) };
      }

      if (customerMode === 'walkin') {
        body.walkIn = true;
      } else if (customerId) {
        body.customerId = customerId;
      }

      if (notes) body.notes = notes;

      // Idempotency key to prevent double-submit
      const idempotencyKey = `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const result = await apiFetch<{ sale: { id: string }; invoiceNumber: string }>(
        '/sales',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      );

      router.push(`/sales/${result.sale.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create sale');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────

  const paymentTotal = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const grandTotal = preview ? parseFloat(preview.grandTotal) : 0;
  const paymentDiff = grandTotal - paymentTotal;

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* LEFT — Cart */}
      <div className="flex-1 flex flex-col min-w-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">POS Billing</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">
            {error}
            <button onClick={() => setError('')} className="ml-2 text-red-500 hover:text-red-700">x</button>
          </div>
        )}

        {/* Product Search */}
        <div className="relative mb-4">
          <input
            type="text"
            placeholder="Search products by name, SKU, or barcode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
            autoFocus
          />
          {searching && <div className="absolute right-3 top-3.5 text-xs text-gray-400">Searching...</div>}

          {searchResults.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
              {searchResults.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="w-full text-left px-4 py-3 hover:bg-gold-50 border-b border-gray-100 last:border-0"
                >
                  <div className="flex justify-between">
                    <div>
                      <span className="font-medium text-sm">{product.name}</span>
                      <span className="text-xs text-gray-400 ml-2 font-mono">{product.sku}</span>
                    </div>
                    <span className="text-sm font-medium text-gold-700">
                      {product.sellingPrice ? formatINR(product.sellingPrice) : 'No rate'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {product.goldPurity} | {product.netWeight}g | Stock: {product.currentStock} | {product.category.name}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart Table */}
        <div className="flex-1 overflow-auto bg-white rounded-lg shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-20">Price</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase w-24">Qty</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-28">Discount</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24">Total</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    Search and add products to start billing
                  </td>
                </tr>
              ) : (
                cart.map((item) => {
                  const previewLine = preview?.lines.find((l) => l.productId === item.product.id);
                  return (
                    <tr key={item.product.id}>
                      <td className="px-3 py-2">
                        <div className="text-sm font-medium">{item.product.name}</div>
                        <div className="text-xs text-gray-400 font-mono">{item.product.sku} | {item.product.goldPurity}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-mono">
                        {previewLine ? formatINR(previewLine.unitPrice) : '--'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                            className="w-6 h-6 rounded border border-gray-300 text-sm hover:bg-gray-100"
                          >-</button>
                          <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                            disabled={item.quantity >= item.product.currentStock}
                            className="w-6 h-6 rounded border border-gray-300 text-sm hover:bg-gray-100 disabled:opacity-50"
                          >+</button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0"
                            value={item.lineDiscount?.value ?? ''}
                            onChange={(e) => setLineDiscount(item.product.id, item.lineDiscount?.type || 'AMOUNT', e.target.value)}
                            className="w-16 px-1.5 py-1 border border-gray-200 rounded text-xs text-right"
                          />
                          <select
                            value={item.lineDiscount?.type ?? 'AMOUNT'}
                            onChange={(e) => setLineDiscount(item.product.id, e.target.value as 'AMOUNT' | 'PCT', String(item.lineDiscount?.value ?? ''))}
                            className="px-1 py-1 border border-gray-200 rounded text-xs"
                          >
                            <option value="AMOUNT">INR</option>
                            <option value="PCT">%</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-mono font-medium">
                        {previewLine ? formatINR(previewLine.lineTotal) : '--'}
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeFromCart(item.product.id)} className="text-red-400 hover:text-red-600 text-sm">x</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT — Billing Panel */}
      <div className="w-96 flex flex-col gap-4 overflow-auto">
        {/* Customer Section */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Customer</h3>
          <div className="flex gap-1 mb-3">
            {(['walkin', 'existing', 'new'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => { setCustomerMode(mode); setSelectedCustomer(null); }}
                className={`flex-1 px-2 py-1.5 text-xs rounded font-medium ${
                  customerMode === mode
                    ? 'bg-gold-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {mode === 'walkin' ? 'Walk-in' : mode === 'existing' ? 'Search' : 'New'}
              </button>
            ))}
          </div>

          {customerMode === 'existing' && (
            <div>
              <input
                type="text"
                placeholder="Search by phone or name..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
              />
              {selectedCustomer ? (
                <div className="bg-green-50 border border-green-200 px-3 py-2 rounded text-sm">
                  <div className="font-medium">{selectedCustomer.name}</div>
                  <div className="text-xs text-gray-500">{selectedCustomer.phone} | Due: {formatINR(selectedCustomer.totalDue)}</div>
                  <button onClick={() => setSelectedCustomer(null)} className="text-xs text-red-500 mt-1">Change</button>
                </div>
              ) : (
                customerResults.length > 0 && (
                  <div className="border border-gray-200 rounded max-h-32 overflow-auto">
                    {customerResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCustomer(c); setCustomerResults([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-0"
                      >
                        {c.name} <span className="text-gray-400">({c.phone})</span>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {customerMode === 'new' && (
            <div className="space-y-2">
              <input type="text" placeholder="Name *" value={newCustomer.name} onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm" />
              <input type="tel" placeholder="Phone (10 digits) *" value={newCustomer.phone} onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm" />
              <input type="email" placeholder="Email" value={newCustomer.email} onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm" />
              <input type="text" placeholder="GSTIN" value={newCustomer.gstin} onChange={(e) => setNewCustomer((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm font-mono" />
            </div>
          )}
        </div>

        {/* GST + Bill Discount */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex gap-4 mb-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">GST Mode</label>
              <select value={gstMode} onChange={(e) => setGstMode(e.target.value as 'INTRA' | 'INTER')} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                <option value="INTRA">Intra-state (CGST+SGST)</option>
                <option value="INTER">Inter-state (IGST)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bill Discount</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={billDiscount.value}
                onChange={(e) => setBillDiscount((p) => ({ ...p, value: e.target.value }))}
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
              <select
                value={billDiscount.type}
                onChange={(e) => setBillDiscount((p) => ({ ...p, type: e.target.value as 'AMOUNT' | 'PCT' }))}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              >
                <option value="AMOUNT">INR</option>
                <option value="PCT">%</option>
              </select>
            </div>
          </div>
        </div>

        {/* Price Summary */}
        {preview && (
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Summary</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-mono">{formatINR(preview.subtotal)}</span>
              </div>
              {parseFloat(preview.totalDiscount) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span className="font-mono">-{formatINR(preview.totalDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Taxable Amount</span>
                <span className="font-mono">{formatINR(preview.taxableAmount)}</span>
              </div>
              {gstMode === 'INTRA' ? (
                <>
                  <div className="flex justify-between text-gray-500 text-xs">
                    <span>CGST (1.5%)</span>
                    <span className="font-mono">{formatINR(preview.cgst)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-xs">
                    <span>SGST (1.5%)</span>
                    <span className="font-mono">{formatINR(preview.sgst)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>IGST (3%)</span>
                  <span className="font-mono">{formatINR(preview.igst)}</span>
                </div>
              )}
              <hr />
              <div className="flex justify-between text-lg font-bold text-gold-700">
                <span>Grand Total</span>
                <span className="font-mono">{formatINR(preview.grandTotal)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Payments */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase">Payments</h3>
            <button type="button" onClick={addPayment} className="text-xs text-gold-700 hover:underline">+ Split</button>
          </div>

          <div className="space-y-2">
            {payments.map((p, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="w-24">
                  <select
                    value={p.mode}
                    onChange={(e) => updatePayment(i, 'mode', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                    {customerMode !== 'walkin' && <option value="CREDIT">Credit</option>}
                  </select>
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Amount"
                    value={p.amount}
                    onChange={(e) => updatePayment(i, 'amount', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                  />
                </div>
                {(p.mode === 'UPI' || p.mode === 'CARD') && (
                  <div className="w-28">
                    <input
                      type="text"
                      placeholder="Ref#"
                      value={p.reference}
                      onChange={(e) => updatePayment(i, 'reference', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                )}
                {payments.length > 1 && (
                  <button onClick={() => removePayment(i)} className="text-red-400 hover:text-red-600 text-sm pb-1">x</button>
                )}
              </div>
            ))}
          </div>

          {preview && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                Paid: <span className="font-mono font-medium">{formatINR(paymentTotal)}</span>
              </span>
              {Math.abs(paymentDiff) > 0.01 && (
                <span className="text-red-600 font-medium">
                  {paymentDiff > 0 ? `${formatINR(paymentDiff)} remaining` : `${formatINR(Math.abs(paymentDiff))} excess`}
                </span>
              )}
              {Math.abs(paymentDiff) <= 0.01 && (
                <span className="text-green-600 font-medium">Balanced</span>
              )}
              {payments.length === 1 && paymentDiff !== 0 && (
                <button onClick={autoFillPayment} className="text-xs text-gold-700 hover:underline ml-2">Auto-fill</button>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-lg shadow p-4">
          <label className="block text-xs text-gray-500 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
            placeholder="Optional notes for the invoice..."
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || cart.length === 0 || !preview || Math.abs(paymentDiff) > 0.01}
          className="w-full bg-gold-600 text-white py-3 rounded-lg hover:bg-gold-700 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Processing...' : `Complete Sale${preview ? ` — ${formatINR(preview.grandTotal)}` : ''}`}
        </button>
      </div>
    </div>
  );
}
