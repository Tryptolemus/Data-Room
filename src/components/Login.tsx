import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield, AlertCircle } from 'lucide-react';

export default function Login() {
  const { login, error, clearError } = useAuth();

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

          <div className="space-y-6">
            <button
              onClick={login}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 transition-colors"
            >
              <Shield className="w-5 h-5 mr-2" />
              Sign in with Google
            </button>
          </div>
          
          <div className="mt-6 text-center text-xs text-zinc-500">
            Protected by BloomBridge Security. Access is restricted to authorized personnel only.
          </div>
        </div>
      </div>
    </div>
  );
}
