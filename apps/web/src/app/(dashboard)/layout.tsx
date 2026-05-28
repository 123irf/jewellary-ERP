'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { useAuthStore } from '@/store/auth';
import { refreshToken, startSilentRefresh, stopSilentRefresh } from '@/lib/api';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUser = useAuthStore((s) => s.setUser);
  const [hydrating, setHydrating] = useState(!isAuthenticated);

  // On mount: attempt silent refresh to hydrate session
  useEffect(() => {
    if (!isAuthenticated) {
      refreshToken()
        .then((result) => {
          if (result) {
            setUser(result.user as any);
          } else {
            router.push('/login');
          }
        })
        .finally(() => setHydrating(false));
    } else {
      setHydrating(false);
    }
    startSilentRefresh();
    return () => stopSilentRefresh();
  }, []);

  if (hydrating) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
