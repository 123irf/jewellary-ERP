'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function CreateVendorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', phone: '', contactPerson: '', email: '',
    gstin: '', address: '', openingBalance: '0',
  });

  function update(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body = {
        name: form.name,
        phone: form.phone,
        contactPerson: form.contactPerson || undefined,
        email: form.email || undefined,
        gstin: form.gstin || undefined,
        address: form.address || undefined,
        openingBalance: parseFloat(form.openingBalance) || undefined,
      };
      const vendor = await apiFetch<{ id: string }>('/vendors', {
        method: 'POST', body: JSON.stringify(body),
      });
      router.push(`/vendors/${vendor.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create vendor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add New Vendor</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name *</label>
          <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} required minLength={2} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone (10 digits) *</label>
          <input type="tel" pattern="\d{10}" value={form.phone} onChange={(e) => update('phone', e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
          <input type="text" value={form.contactPerson} onChange={(e) => update('contactPerson', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
          <input type="text" maxLength={15} value={form.gstin} onChange={(e) => update('gstin', e.target.value.toUpperCase())} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono" placeholder="e.g. 29ABCDE1234F1Z5" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <textarea value={form.address} onChange={(e) => update('address', e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Opening Balance (INR)</label>
          <input type="number" step="0.01" min="0" value={form.openingBalance} onChange={(e) => update('openingBalance', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <p className="text-xs text-gray-400 mt-1">Amount we owe this vendor at creation. Creates an OPENING_BALANCE transaction.</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="bg-gold-600 text-white px-6 py-2 rounded-md hover:bg-gold-700 font-medium text-sm disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Vendor'}
          </button>
          <button type="button" onClick={() => router.back()} className="px-6 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </form>
    </div>
  );
}
