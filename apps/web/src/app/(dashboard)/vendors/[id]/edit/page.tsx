'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function EditVendorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', phone: '', contactPerson: '', email: '', gstin: '', address: '',
  });

  useEffect(() => {
    apiFetch<any>(`/vendors/${id}`)
      .then((v) => setForm({
        name: v.name, phone: v.phone,
        contactPerson: v.contactPerson || '', email: v.email || '',
        gstin: v.gstin || '', address: v.address || '',
      }))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  function update(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiFetch(`/vendors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name, phone: form.phone,
          contactPerson: form.contactPerson || null, email: form.email || null,
          gstin: form.gstin || null, address: form.address || null,
        }),
      });
      router.push(`/vendors/${id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update vendor');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Vendor</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input type="tel" pattern="\d{10}" value={form.phone} onChange={(e) => update('phone', e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label><input type="text" value={form.contactPerson} onChange={(e) => update('contactPerson', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label><input type="text" maxLength={15} value={form.gstin} onChange={(e) => update('gstin', e.target.value.toUpperCase())} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Address</label><textarea value={form.address} onChange={(e) => update('address', e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" /></div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="bg-gold-600 text-white px-6 py-2 rounded-md hover:bg-gold-700 font-medium text-sm disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          <button type="button" onClick={() => router.back()} className="px-6 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </form>
    </div>
  );
}
