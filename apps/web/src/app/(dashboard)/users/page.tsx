'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create user form state
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{ name: string; email: string; password: string; confirmPassword: string; role: 'ADMIN' | 'STAFF' }>({ name: '', email: '', password: '', confirmPassword: '', role: 'STAFF' });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Feedback messages
  const [feedback, setFeedback] = useState('');

  async function fetchUsers() {
    try {
      const data = await apiFetch<UserRow[]>('/users');
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (form.password !== form.confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }
    setFormLoading(true);
    try {
      const { confirmPassword, ...payload } = form;
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', confirmPassword: '', role: 'STAFF' });
      setFeedback('User created successfully');
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm('Deactivate this user?')) return;
    try {
      await apiFetch(`/users/${id}`, { method: 'DELETE' });
      setFeedback('User deactivated');
      fetchUsers();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    }
  }

  async function handleResetPassword(id: string, name: string) {
    if (!confirm(`Reset password for ${name}?`)) return;
    try {
      const data = await apiFetch<{ temporaryPassword: string }>(`/users/${id}/reset-password`, {
        method: 'POST',
      });
      setFeedback(`Temporary password for ${name}: ${data.temporaryPassword}`);
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    }
  }

  async function handleUnlock(id: string) {
    try {
      await apiFetch(`/users/${id}/unlock`, { method: 'POST' });
      setFeedback('Account unlocked');
      fetchUsers();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    }
  }

  if (loading) return <div className="p-6">Loading users...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-gold-600 text-white px-4 py-2 rounded-md hover:bg-gold-700 font-medium text-sm"
        >
          {showCreate ? 'Cancel' : 'Create User'}
        </button>
      </div>

      {feedback && (
        <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded text-sm flex justify-between items-center">
          <span className="font-mono text-xs break-all">{feedback}</span>
          <button onClick={() => setFeedback('')} className="ml-4 text-blue-600 hover:underline text-xs">
            Dismiss
          </button>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="font-semibold text-gray-900">New User</h2>
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <input
              placeholder="Password (min 10, letter+digit+symbol)"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <input
              placeholder="Confirm Password"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              required
              className={`px-3 py-2 border rounded-md text-sm ${form.confirmPassword && form.password !== form.confirmPassword ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
            />
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'ADMIN' | 'STAFF' }))}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="STAFF">STAFF</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={formLoading}
            className="bg-gold-600 text-white px-4 py-2 rounded-md hover:bg-gold-700 text-sm font-medium disabled:opacity-50"
          >
            {formLoading ? 'Creating...' : 'Create'}
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Last Login</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN') : 'Never'}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => handleResetPassword(u.id, u.name)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Reset PW
                  </button>
                  <button onClick={() => handleUnlock(u.id)} className="text-xs text-orange-600 hover:underline">
                    Unlock
                  </button>
                  {u.isActive && u.id !== currentUser?.id && (
                    <button
                      onClick={() => handleDeactivate(u.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
