import React, { useEffect, useState } from 'react';
import { useAuth, useCanViewAnalytics } from '../contexts/AuthContext';
import { LogOut, ShieldCheck, FileText, Users, Activity, MessageSquare, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, logout } = useAuth();
  const canViewAnalytics = useCanViewAnalytics();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const navItems = [
    { name: 'Documents', href: '/', icon: FileText },
    ...(isAdmin ? [{ name: 'Access Control', href: '/access', icon: Users }] : []),
    ...(canViewAnalytics ? [{ name: 'Analytics', href: '/analytics', icon: Activity }] : []),
    { name: 'Messages', href: '/messages', icon: MessageSquare },
  ];

  // Close drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const sidebar = (
    <div className="h-full w-64 bg-zinc-900 text-zinc-300 flex flex-col shadow-2xl">
      <div className="p-6 flex items-center gap-3 border-b border-zinc-800">
        <img
          src="https://ipfs.io/ipfs/bafkreicor57xlydqauw5y4n6jglxm4l2jke3ofaq4qldel5hlzazs2gmyy"
          alt="Logo"
          className="w-10 h-10 object-contain bg-white rounded-lg p-1"
          referrerPolicy="no-referrer"
        />
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-white tracking-tight">Data Room</h1>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">
            {isAdmin ? 'Admin' : 'Viewer'}
          </p>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              )}
            >
              <Icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 flex-shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{profile?.name}</p>
            <p className="text-xs text-zinc-500 truncate">{profile?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-zinc-400 bg-zinc-800/50 hover:bg-zinc-800 hover:text-white rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-shrink-0 md:sticky md:top-0 md:h-screen">
        {sidebar}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 md:hidden">
            {sidebar}
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 bg-white border-b border-zinc-200 flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 rounded-lg text-zinc-700 hover:bg-zinc-100"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <img
            src="https://ipfs.io/ipfs/bafkreicor57xlydqauw5y4n6jglxm4l2jke3ofaq4qldel5hlzazs2gmyy"
            alt="Logo"
            className="w-7 h-7 object-contain bg-white rounded p-0.5"
            referrerPolicy="no-referrer"
          />
          <span className="font-semibold text-zinc-900">Data Room</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
