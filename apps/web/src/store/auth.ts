import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  role: 'ADMIN' | 'STAFF';
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }, false, 'setUser'),
      clear: () => set({ user: null, isAuthenticated: false }, false, 'clear'),
    }),
    { name: 'auth-store' },
  ),
);
