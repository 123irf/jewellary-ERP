'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/format';
import { useAuthStore } from '@/store/auth';

interface VendorProfile {
  id: string;
  code: string;
  name: string;
  phone: string;
  contactPerson: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  runningBalance: string;
  isActive: boolean;
  summary: { lifetimePurchases: string; lifetimePayments: string; currentBalance: string };
  recentTransactions: Array<{
    id: string;
    txnType: string;
    direction: string;
    amount: string;
    balanceAfter: string;
    referenceNo: string | null;
    notes: string | null;
    txnDate: string;
    createdBy: { name: string };
  }>;
}

export default function VendorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    apiFetch<VendorProfile>(`/vendors/${id}`)
      .then(setVendor)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-gray-500">Loading...</div>;
  if (!vendor) return <div className="text-red-600">Vendor not found</div>;

  const balance = parseFloat(vendor.runningBalance);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{vendor.name}</h1>
          <p className="text-sm text-gray-500 font-mono">{vendor.code} | {vendor.phone}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/vendors/${id}/edit`} className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50">Edit</Link>
          <Link href={`/vendors/${id}/ledger`} className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50">Full Ledger</Link>
          <Link href={`/vendors/${id}/transactions/new`} className="bg-gold-600 text-white px-4 py-2 rounded-md hover:bg-gold-700 font-medium text-sm">+ Transaction</Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-xs text-gray-500 font-medium uppercase">Lifetime Purchases</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{formatINR(vendor.summary.lifetimePurchases)}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-xs text-gray-500 font-medium uppercase">Lifetime Payments</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{formatINR(vendor.summary.lifetimePayments)}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-xs text-gray-500 font-medium uppercase">Current Balance</div>
          <div className={`text-xl font-bold mt-1 ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-gray-500'}`}>
            {formatINR(vendor.summary.currentBalance)}
          </div>
          <div className="text-xs text-gray-400 mt-1">{balance > 0 ? 'We owe vendor' : balance < 0 ? 'Vendor owes us' : 'Settled'}</div>
        </div>
      </div>

      {/* Vendor Details */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Contact Info</h2>
          <dl className="space-y-2 text-sm">
            {vendor.contactPerson && <><dt className="text-gray-500">Contact Person</dt><dd>{vendor.contactPerson}</dd></>}
            {vendor.email && <><dt className="text-gray-500">Email</dt><dd>{vendor.email}</dd></>}
            {vendor.gstin && <><dt className="text-gray-500">GSTIN</dt><dd className="font-mono">{vendor.gstin}</dd></>}
            {vendor.address && <><dt className="text-gray-500">Address</dt><dd>{vendor.address}</dd></>}
          </dl>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase">Recent Transactions</h2>
          <Link href={`/vendors/${id}/ledger`} className="text-sm text-gold-700 hover:underline">View full ledger</Link>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance After</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {vendor.recentTransactions.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No transactions yet</td></tr>
            ) : (
              vendor.recentTransactions.map((txn) => (
                <tr key={txn.id} className={txn.txnType === 'ADJUSTMENT' ? 'bg-amber-50' : ''}>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(txn.txnDate)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      txn.direction === 'CREDIT' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>{txn.txnType}</span>
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-mono ${txn.direction === 'CREDIT' ? 'text-red-600' : 'text-green-600'}`}>
                    {txn.direction === 'CREDIT' ? '+' : '-'}{formatINR(txn.amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{formatINR(txn.balanceAfter)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{txn.referenceNo || '--'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{txn.createdBy.name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
