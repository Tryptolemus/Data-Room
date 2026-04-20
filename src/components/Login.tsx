import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield, AlertCircle, Mail, Lock, CheckCircle2, Loader2 } from 'lucide-react';

type Mode = 'signin' | 'signup' | 'reset';

export default function Login() {
  const { login, loginWithEmail, signupWithEmail, sendPasswordReset, error, info, clearError } =
    useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    clearError();
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await loginWithEmail(email, password);
      } else if (mode === 'signup') {
        await signupWithEmail(email, password, name);
      } else {
        await sendPasswordReset(email);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: Mode) => {
    clearError();
    setMode(next);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img
            src="https://ipfs.io/ipfs/bafkreicor57xlydqauw5y4n6jglxm4l2jke3ofaq4qldel5hlzazs2gmyy"
            alt="BloomBridge Logo"
            className="h-24 w-auto object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-zinc-900">
          Secure Data Room
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-600">
          Sign in to access corporate documentation
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-zinc-100">

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800">Authentication Error</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
              <button onClick={clearError} className="text-red-500 hover:text-red-700">
                &times;
              </button>
            </div>
          )}

          {info && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 mr-3 flex-shrink-0" />
              <p className="text-sm text-emerald-800 flex-1">{info}</p>
              <button onClick={clearError} className="text-emerald-500 hover:text-emerald-700">
                &times;
              </button>
            </div>
          )}

          <button
            onClick={login}
            className="w-full flex justify-center items-center py-2.5 px-4 border border-zinc-300 rounded-xl shadow-sm text-sm font-medium text-zinc-700 bg-white hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 transition-colors"
          >
            <Shield className="w-5 h-5 mr-2" />
            Sign in with Google
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white text-zinc-500">
                or continue with email
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="block w-full rounded-lg border-zinc-300 focus:ring-zinc-500 focus:border-zinc-500 sm:text-sm px-3 py-2 border"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="block w-full rounded-lg border-zinc-300 focus:ring-zinc-500 focus:border-zinc-500 sm:text-sm pl-9 pr-3 py-2 border"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className="block w-full rounded-lg border-zinc-300 focus:ring-zinc-500 focus:border-zinc-500 sm:text-sm pl-9 pr-3 py-2 border"
                    placeholder={mode === 'signup' ? 'At least 6 characters' : ''}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 disabled:opacity-50 transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === 'signin' && 'Sign in'}
              {mode === 'signup' && 'Create account'}
              {mode === 'reset' && 'Send reset link'}
            </button>
          </form>

          <div className="mt-4 text-center text-xs text-zinc-500 space-x-3">
            {mode !== 'signin' && (
              <button onClick={() => switchMode('signin')} className="hover:text-zinc-900 underline">
                Sign in
              </button>
            )}
            {mode !== 'signup' && (
              <button onClick={() => switchMode('signup')} className="hover:text-zinc-900 underline">
                Create account
              </button>
            )}
            {mode !== 'reset' && (
              <button onClick={() => switchMode('reset')} className="hover:text-zinc-900 underline">
                Forgot password?
              </button>
            )}
          </div>

          <div className="mt-6 text-center text-xs text-zinc-500">
            Access is restricted to authorized personnel only. Your email must be approved by an
            admin before you can sign in or create an account.
          </div>
        </div>
      </div>
    </div>
  );
}
