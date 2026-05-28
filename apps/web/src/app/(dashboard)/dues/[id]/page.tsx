'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/format';
import { useAuthStore } from '@/store/auth';

interface DuePayment {
  id: string;
  mode: string;
  amount: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  receivedBy: { id: string; name: string };
}

interface DueDetail {
  id: string;
  customerId: string;
  originalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  clearedAt: string | null;
  customer: { id: string; name: string; phone: string; totalDue: string };
  sale: { id: string; invoiceNumber: string; grandTotal: string; status: string; createdAt: string };
  payments: DuePayment[];
}

export default function DueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [due, setDue] = useState<DueDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Payment form state
  const [payMode, setPayMode] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [payAmount, setPayAmount] = useState('');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [creditToast, setCreditToast] = useState<string | null>(null);

  // Write-off form
  const [writeOffReason, setWriteOffReason] = useState('');
  const [showWriteOff, setShowWriteOff] = useState(false);

  async function fetchDue() {
    setLoading(true);
    try {
      const result = await apiFetch<DueDetail>(`/dues/${params.id}`);
      setDue(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDue(); }, [params.id]);

  async function handleCollectPayment(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await apiFetch<{ due: DueDetail; creditIssued: string | null }>(
        `/dues/${params.id}/payments`,
        {
          method: 'POST',
          body: JSON.stringify({
            mode: payMode,
            amount: parseFloat(payAmount),
            reference: payRef || undefined,
            notes: payNotes || undefined,
          }),
        },
      );
      setDue(result.due);
      setPayAmount('');
      setPayRef('');
      setPayNotes('');
      if (result.creditIssued) {
        setCreditToast(result.creditIssued);
        setTimeout(() => setCreditToast(null), 5000);
      }
    } catch (err: any) {
      setError(err.message || 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClearDue() {
    setError('');
    setSubmitting(true);
    try {
      const result = await apiFetch<{ due: DueDetail; creditIssued: string | null }>(
        `/dues/${params.id}/clear`,
        {
          method: 'POST',
          body: JSON.stringify({ mode: payMode, reference: payRef || undefined }),
        },
      );
      setDue(result.due);
    } catch (err: any) {
      setError(err.message || 'Clear failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWriteOff(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await apiFetch<DueDetail>(
        `/dues/${params.id}/write-off`,
        { method: 'POST', body: JSON.stringify({ reason: writeOffReason }) },
      );
      setDue(result);
      setShowWriteOff(false);
      setWriteOffReason('');
    } catch (err: any) {
      setError(err.message || 'Write-off failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (!due) return <div className="text-center py-12 text-gray-500">Due not found</div>;

  const isOpen = due.status === 'PENDING' || due.status === 'PARTIAL';
  const paidPct = parseFloat(due.originalAmount) > 0
    ? Math.round((parseFloat(due.paidAmount) / parseFloat(due.originalAmount)) * 100)
    : 0;

  const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    PARTIAL: 'bg-blue-100 text-blue-800',
    CLEARED: 'bg-green-100 text-green-800',
    VOIDED: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Credit toast */}
      {creditToast && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-800 text-sm">
          Credit issued: {formatINR(creditToast)}
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-1">&larr; Back</button>
          <h1 className="text-2xl font-bold text-gray-900">Due Detail</h1>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[due.status]}`}>
          {due.status}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow px-4 py-3">
          <div className="text-xs text-gray-500 uppercase">Original Amount</div>
          <div className="text-lg font-bold">{formatINR(due.originalAmount)}</div>
        </div>
        <div className="bg-white rounded-lg shadow px-4 py-3">
          <div className="text-xs text-gray-500 uppercase">Paid</div>
          <div className="text-lg font-bold text-green-600">{formatINR(due.paidAmount)}</div>
        </div>
        <div className="bg-white rounded-lg shadow px-4 py-3">
          <div className="text-xs text-gray-500 uppercase">Balance</div>
          <div className="text-lg font-bold text-red-600">{formatINR(due.balanceAmount)}</div>
        </div>
        <div className="bg-white rounded-lg shadow px-4 py-3">
          <div className="text-xs text-gray-500 uppercase">Progress</div>
          <div className="mt-1">
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
            </div>
            <span className="text-xs text-gray-500">{paidPct}%</span>
          </div>
        </div>
      </div>

      {/* Info rows */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-sm text-gray-500">Customer:</span>{' '}
          <Link href={`/customers/${due.customer.id}`} className="text-sm font-medium text-gold-700 hover:underline">
            {due.customer.name} ({due.customer.phone})
          </Link>
        </div>
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-sm text-gray-500">Invoice:</span>{' '}
          <span className="text-sm font-mono">{due.sale.invoiceNumber}</span>
        </div>
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-sm text-gray-500">Created:</span>{' '}
          <span className="text-sm">{formatDate(due.createdAt)}</span>
        </div>
        {due.dueDate && (
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">Due Date:</span>{' '}
            <span className={`text-sm ${new Date(due.dueDate) < new Date() && isOpen ? 'text-red-600 font-medium' : ''}`}>
              {formatDate(due.dueDate)}
            </span>
          </div>
        )}
        {due.clearedAt && (
          <div className="px-4 py-3">
            <span className="text-sm text-gray-500">Cleared:</span>{' '}
            <span className="text-sm">{formatDate(due.clearedAt)}</span>
          </div>
        )}
      </div>

      {/* Payment history */}
      <div className="bg-white rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold px-4 py-3 border-b border-gray-200">Payment History</h2>
        {due.payments.length === 0 ? (
          <div className="px-4 py-6 text-center text-gray-500 text-sm">No payments yet</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mode</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Received By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {due.payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 text-sm">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-2 text-sm">{p.mode}</td>
                  <td className="px-4 py-2 text-sm text-right font-medium">{formatINR(p.amount)}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">{p.reference || '--'}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">{p.receivedBy.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Collect payment form — only for open dues */}
      {isOpen && (
        <div className="bg-white rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold px-4 py-3 border-b border-gray-200">Collect Payment</h2>
          <form onSubmit={handleCollectPayment} className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                <select
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">Card</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={`Balance: ${due.balanceAmount}`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Transaction ID, cheque no..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="bg-gold-600 text-white px-4 py-2 rounded-md hover:bg-gold-700 font-medium text-sm disabled:opacity-50"
              >
                {submitting ? 'Processing...' : 'Collect Payment'}
              </button>
              <button
                type="button"
                onClick={handleClearDue}
                disabled={submitting}
                className="border border-green-600 text-green-700 px-4 py-2 rounded-md hover:bg-green-50 font-medium text-sm disabled:opacity-50"
              >
                Clear Full Balance ({formatINR(due.balanceAmount)})
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Write-off — ADMIN only, open dues only */}
      {isOpen && user?.role === 'ADMIN' && (
        <div className="bg-white rounded-lg shadow">
          {!showWriteOff ? (
            <div className="px-4 py-3">
              <button
                onClick={() => setShowWriteOff(true)}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Write Off This Due
              </button>
            </div>
          ) : (
            <form onSubmit={handleWriteOff} className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-red-700">Write Off — Bad Debt</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
                <textarea
                  value={writeOffReason}
                  onChange={(e) => setWriteOffReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  rows={2}
                  required
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 font-medium text-sm disabled:opacity-50"
                >
                  Confirm Write-Off
                </button>
                <button
                  type="button"
                  onClick={() => setShowWriteOff(false)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
