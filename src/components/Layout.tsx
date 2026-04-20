import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, ShieldCheck, FileText, Users, Activity, MessageSquare } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, logout } = useAuth();
  const location = useLocation();

  const isAdmin = profile?.role === 'admin';

  const navItems = isAdmin ? [
    { name: 'Documents', href: '/', icon: FileText },
    { name: 'Access Control', href: '/access', icon: Users },
    { name: 'Analytics', href: '/analytics', icon: Activity },
    { name: 'Messages', href: '/messages', icon: MessageSquare },
  ] : [
    { name: 'Documents', href: '/', icon: FileText },
    { name: 'Analytics', href: '/analytics', icon: Activity },
    { name: 'Messages', href: '/messages', icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-zinc-900 text-zinc-300 flex flex-col shadow-2xl">
        <div className="p-6 flex items-center gap-3 border-b border-zinc-800">
          <img 
            src="https://ipfs.io/ipfs/bafkreicor57xlydqauw5y4n6jglxm4l2jke3ofaq4qldel5hlzazs2gmyy" 
            alt="Logo" 
            className="w-10 h-10 object-contain bg-white rounded-lg p-1"
            referrerPolicy="no-referrer"
          />
          <div>
            <h1 className="font-semibold text-white tracking-tight">Data Room</h1>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">{isAdmin ? 'Admin' : 'Viewer'}</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
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
            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
