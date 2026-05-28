'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { logout } from '@/lib/api';
import { useRouter } from 'next/navigation';
import {
  Package,
  AlertTriangle,
  CircleDollarSign,
  Store,
  ShoppingCart,
  ClipboardList,
  CreditCard,
  ArrowLeftRight,
  Users,
  UserCircle,
  FileText,
  LogOut,
  type LucideIcon,
} from 'lucide-react';

const navItems: { label: string; href: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { label: 'Inventory', href: '/inventory', icon: Package },
  { label: 'Low Stock', href: '/inventory/low-stock', icon: AlertTriangle },
  { label: 'Gold Rate', href: '/inventory/gold-rate', icon: CircleDollarSign, adminOnly: true },
  { label: 'Vendors', href: '/vendors', icon: Store },
  { label: 'POS', href: '/pos', icon: ShoppingCart },
  { label: 'Sales', href: '/sales', icon: ClipboardList },
  { label: 'Customers', href: '/customers', icon: UserCircle },
  { label: 'Dues', href: '/dues', icon: CreditCard },
  { label: 'Stock Movements', href: '/stock-movements', icon: ArrowLeftRight, adminOnly: true },
  { label: 'Users', href: '/users', icon: Users, adminOnly: true },
  { label: 'Audit Log', href: '/audit-log', icon: FileText, adminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const router = useRouter();

  const filteredItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === 'ADMIN',
  );

  async function handleLogout() {
    await logout();
    clear();
    document.cookie = 'userRole=; path=/; max-age=0';
    router.push('/login');
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gold-700">Jewellery ERP</h1>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gold-50 text-gold-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-200">
        <div className="px-3 py-2 text-sm text-gray-600">
          <div className="font-medium">{user?.name}</div>
          <div className="text-xs text-gray-400">{user?.role}</div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
