'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/format';

interface CustomerDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gstin: string | null;
  address: string | null;
  totalDue: string;
  createdAt: string;
  sales: Array<{
    id: string;
    invoiceNumber: string;
    grandTotal: string;
    status: string;
    createdAt: string;
  }>;
  dues: Array<{
    id: string;
    originalAmount: string;
    paidAmount: string;
    balanceAmount: string;
    status: string;
    dueDate: string | null;
    createdAt: string;
  }>;
}

interface DuesSummary {
  totalDue: string;
  openCount: number;
  overdueCount: number;
  credits: string;
  agingBuckets: {
    current: string;
    '1-30days': string;
    '31-60days': string;
    '61-90days': string;
    '90plus': string;
  };
}

export default function CustomerDetailPage() {
  const params = useParams();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [summary, setSummary] = useState<DuesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'sales' | 'dues'>('dues');

  useEffect(() => {
    (async () => {
      try {
        const [c, s] = await Promise.all([
          apiFetch<CustomerDetail>(`/customers/${params.id}`),
          apiFetch<DuesSummary>(`/customers/${params.id}/dues-summary`),
        ]);
        setCustomer(c);
        setSummary(s);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (!customer) return <div className="text-center py-12 text-gray-500">Customer not found</div>;

  const totalDue = parseFloat(customer.totalDue);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
          <div className="text-sm text-gray-500">{customer.phone}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 uppercase">Total Due</div>
          <Link href={`/customers/${customer.id}/dues`}>
            <span className={`text-xl font-bold cursor-pointer ${totalDue > 0 ? 'text-red-600 hover:underline' : 'text-green-600'}`}>
              {formatINR(customer.totalDue)}
            </span>
          </Link>
        </div>
      </div>

      {/* Customer info */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-200">
          <div className="px-4 py-3">
            <div className="text-xs text-gray-500">Phone</div>
            <div className="text-sm font-medium">{customer.phone}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-xs text-gray-500">Email</div>
            <div className="text-sm">{customer.email || '--'}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-xs text-gray-500">GSTIN</div>
            <div className="text-sm font-mono">{customer.gstin || '--'}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-xs text-gray-500">Since</div>
            <div className="text-sm">{formatDate(customer.createdAt)}</div>
          </div>
        </div>
      </div>

      {/* Dues summary */}
      {summary && (
        <div className="bg-white rounded-lg shadow mb-6">
          <h2 className="text-sm font-semibold px-4 py-2 border-b border-gray-200 text-gray-700 uppercase">Dues Summary</h2>
          <div className="grid grid-cols-4 divide-x divide-gray-200">
            <div className="px-4 py-3 text-center">
              <div className="text-xs text-gray-500">Open</div>
              <div className="text-lg font-bold">{summary.openCount}</div>
            </div>
            <div className="px-4 py-3 text-center">
              <div className="text-xs text-gray-500">Overdue</div>
              <div className={`text-lg font-bold ${summary.overdueCount > 0 ? 'text-red-600' : ''}`}>{summary.overdueCount}</div>
            </div>
            <div className="px-4 py-3 text-center">
              <div className="text-xs text-gray-500">Total Due</div>
              <div className="text-lg font-bold text-red-600">{formatINR(summary.totalDue)}</div>
            </div>
            <div className="px-4 py-3 text-center">
              <div className="text-xs text-gray-500">Credits</div>
              <div className="text-lg font-bold text-green-600">{formatINR(summary.credits)}</div>
            </div>
          </div>
          <div className="px-4 py-2 border-t border-gray-100">
            <div className="text-xs text-gray-500 mb-1">Aging</div>
            <div className="flex gap-3 text-xs">
              <span className="text-green-700">Current: {formatINR(summary.agingBuckets.current)}</span>
              <span className="text-yellow-700">1-30d: {formatINR(summary.agingBuckets['1-30days'])}</span>
              <span className="text-orange-700">31-60d: {formatINR(summary.agingBuckets['31-60days'])}</span>
              <span className="text-red-700">61-90d: {formatINR(summary.agingBuckets['61-90days'])}</span>
              <span className="text-red-900">90+d: {formatINR(summary.agingBuckets['90plus'])}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setTab('dues')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'dues' ? 'border-gold-600 text-gold-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Open Dues ({customer.dues.length})
        </button>
        <button
          onClick={() => setTab('sales')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'sales' ? 'border-gold-600 text-gold-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Recent Sales ({customer.sales.length})
        </button>
        <Link
          href={`/customers/${customer.id}/dues`}
          className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent"
        >
          Full Due History &rarr;
        </Link>
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {tab === 'dues' ? (
          customer.dues.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">No open dues</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Original</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {customer.dues.map((d) => {
                  const pct = parseFloat(d.originalAmount) > 0
                    ? Math.round((parseFloat(d.paidAmount) / parseFloat(d.originalAmount)) * 100)
                    : 0;
                  return (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-right">{formatINR(d.originalAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-green-600">{formatINR(d.paidAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-red-600">{formatINR(d.balanceAmount)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                          {d.status}
                        </span>
                        <div className="w-16 bg-gray-200 rounded-full h-1.5 mt-1">
                          <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(d.createdAt)}</td>
                      <td className="px-4 py-3 text-sm">
                        <Link href={`/dues/${d.id}`} className="text-gold-700 hover:underline text-xs">Collect</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : (
          customer.sales.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">No sales yet</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {customer.sales.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono">{s.invoiceNumber}</td>
                    <td className="px-4 py-3 text-sm text-right">{formatINR(s.grandTotal)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
