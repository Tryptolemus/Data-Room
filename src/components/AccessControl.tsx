import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, onSnapshot, setDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { UserPlus, Trash2, Shield, Loader2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export default function AccessControl() {
  const { profile } = useAuth();
  const [emails, setEmails] = useState<any[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [emailToDelete, setEmailToDelete] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'allowedEmails'), orderBy('addedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEmails(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !profile) return;

    setAdding(true);
    try {
      const emailLower = newEmail.toLowerCase().trim();
      await setDoc(doc(db, 'allowedEmails', emailLower), {
        email: emailLower,
        addedAt: new Date().toISOString(),
        addedBy: profile.email
      });
      setNewEmail('');
    } catch (error) {
      console.error('Error adding email:', error);
    } finally {
      setAdding(false);
    }
  };

  const confirmDelete = async () => {
    if (!emailToDelete) return;
    try {
      await deleteDoc(doc(db, 'allowedEmails', emailToDelete));
    } catch (error) {
      console.error('Error removing email:', error);
    } finally {
      setEmailToDelete(null);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Access Control</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage who has access to the data room. Only authorized emails can sign in.
        </p>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
        <form onSubmit={handleAddEmail} className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="email" className="sr-only">Email address</label>
            <input
              type="email"
              id="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="block w-full rounded-lg border-zinc-300 shadow-sm focus:ring-zinc-500 focus:border-zinc-500 sm:text-sm px-4 py-2 border"
              placeholder="Enter email address to authorize"
            />
          </div>
          <button
            type="submit"
            disabled={adding || !newEmail}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 disabled:opacity-50 transition-colors"
          >
            {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
            Authorize Email
          </button>
        </form>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 overflow-hidden">
          <ul className="divide-y divide-zinc-200">
            {emails.map((item) => (
              <li key={item.id} className="hover:bg-zinc-50 transition-colors">
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{item.email}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Added {format(new Date(item.addedAt), 'MMM d, yyyy')} by {item.addedBy}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEmailToDelete(item.id)}
                    className="inline-flex items-center p-2 border border-transparent rounded-full shadow-sm text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                    title="Revoke Access"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
            {emails.length === 0 && (
              <li className="px-6 py-12 text-center text-zinc-500 text-sm">
                No authorized emails yet. Add an email above to grant access.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {emailToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-semibold text-zinc-900">Revoke Access</h3>
            </div>
            <p className="text-sm text-zinc-600 mb-6">
              Are you sure you want to revoke access for this email? They will no longer be able to sign in.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEmailToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
