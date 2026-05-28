'use client';

import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300">403</h1>
        <h2 className="mt-4 text-xl font-semibold text-gray-900">Access Denied</h2>
        <p className="mt-2 text-gray-500">You do not have permission to view this page.</p>
        <Link
          href="/inventory"
          className="mt-6 inline-block bg-gold-600 text-white px-6 py-2 rounded-md hover:bg-gold-700 font-medium"
        >
          Go to Inventory
        </Link>
      </div>
    </div>
  );
}
