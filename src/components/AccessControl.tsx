import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import {
  collection,
  query,
  onSnapshot,
  setDoc,
  deleteDoc,
  doc,
  orderBy,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDocs,
  where,
} from 'firebase/firestore';
import {
  UserPlus,
  Trash2,
  Shield,
  Loader2,
  AlertTriangle,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react';
import { format } from 'date-fns';

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  allowedEmails: string[];
  editorEmails?: string[];
  adminEmails?: string[];
}

type ProjectRole = 'viewer' | 'editor' | 'admin';

function projectRoleFor(project: Project, email: string): ProjectRole | null {
  if ((project.adminEmails || []).includes(email)) return 'admin';
  if ((project.editorEmails || []).includes(email)) return 'editor';
  if ((project.allowedEmails || []).includes(email)) return 'viewer';
  return null;
}

export default function AccessControl() {
  const { profile } = useAuth();
  const [emails, setEmails] = useState<any[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [emailToDelete, setEmailToDelete] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'allowedEmails'), orderBy('addedAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setEmails(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching allowedEmails:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setProjects(
          snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Project[]
        );
        setProjectsError(null);
        setProjectsLoading(false);
      },
      (err) => {
        console.error('Error fetching projects:', err);
        setProjectsError(
          err?.code === 'permission-denied'
            ? 'Permission denied reading projects. Make sure the updated firestore.rules have been deployed to Firebase.'
            : err?.message || 'Failed to load projects.'
        );
        setProjectsLoading(false);
      }
    );
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
        addedBy: profile.email,
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

  const cascadeToNonRestrictedDocs = async (
    projectId: string,
    op: 'add' | 'remove',
    email: string
  ) => {
    try {
      const snap = await getDocs(
        query(collection(db, 'documents'), where('projectId', '==', projectId))
      );
      const writes: Promise<void>[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        if (data.visibility === 'restricted') return; // private docs keep their own list
        writes.push(
          updateDoc(d.ref, {
            allowedEmails: op === 'add' ? arrayUnion(email) : arrayRemove(email),
          }) as unknown as Promise<void>
        );
      });
      await Promise.all(writes);
    } catch (err) {
      console.error('Error cascading project access to docs:', err);
    }
  };

  const setProjectRole = async (
    projectId: string,
    email: string,
    role: ProjectRole
  ) => {
    const emailLower = email.toLowerCase().trim();
    if (!emailLower) return;
    try {
      const update: any = {
        allowedEmails: arrayUnion(emailLower),
        editorEmails: role === 'editor' ? arrayUnion(emailLower) : arrayRemove(emailLower),
        adminEmails: role === 'admin' ? arrayUnion(emailLower) : arrayRemove(emailLower),
      };
      await updateDoc(doc(db, 'projects', projectId), update);
      await cascadeToNonRestrictedDocs(projectId, 'add', emailLower);
    } catch (err: any) {
      console.error('Error setting project role:', err);
      alert('Failed to set role: ' + (err?.message || 'unknown error'));
    }
  };

  const removeEmailFromProject = async (projectId: string, email: string) => {
    try {
      await updateDoc(doc(db, 'projects', projectId), {
        allowedEmails: arrayRemove(email),
        editorEmails: arrayRemove(email),
        adminEmails: arrayRemove(email),
      });
      await cascadeToNonRestrictedDocs(projectId, 'remove', email);
    } catch (err) {
      console.error('Error removing email from project:', err);
    }
  };

  // Backfill: align every document in this project with the current member list.
  // Non-restricted docs get `allowedEmails` replaced with the project's list.
  const syncProjectDocs = async (project: Project) => {
    try {
      const snap = await getDocs(
        query(collection(db, 'documents'), where('projectId', '==', project.id))
      );
      const writes: Promise<void>[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        if (data.visibility === 'restricted') return;
        writes.push(
          updateDoc(d.ref, {
            visibility: 'project',
            allowedEmails: project.allowedEmails || [],
          }) as unknown as Promise<void>
        );
      });
      await Promise.all(writes);
      alert(`Synced ${writes.length} document${writes.length === 1 ? '' : 's'}.`);
    } catch (err: any) {
      console.error('Error syncing project docs:', err);
      alert('Failed to sync: ' + (err?.message || 'unknown error'));
    }
  };

  return (
    <div className="space-y-8 relative">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Access Control</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage who can sign in and which projects each person can see.
        </p>
      </div>

      {/* Global sign-in access */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Authorized Emails</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Only these emails can sign in to the data room. Granting project access still requires
            the email to be authorized here.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
          <form onSubmit={handleAddEmail} className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
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
              {adding ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4 mr-2" />
              )}
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
      </section>

      {/* Per-project access */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Project Access</h2>
          <p className="text-xs text-zinc-500 mt-1">
            A project only appears in a user&apos;s data room if their email is listed here. Create
            projects from the Documents page.
          </p>
        </div>

        {projectsError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-800">Can&apos;t load projects</h3>
              <p className="mt-1 text-sm text-red-700">{projectsError}</p>
            </div>
          </div>
        ) : projectsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 border-dashed p-8 text-center">
            <FolderOpen className="mx-auto h-10 w-10 text-zinc-300" />
            <p className="mt-2 text-sm text-zinc-500">
              No projects yet. Create a project from the Documents page.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <ul className="divide-y divide-zinc-200">
              {projects.map((p) => (
                <ProjectAccessRow
                  key={p.id}
                  project={p}
                  expanded={expandedProjectId === p.id}
                  onToggle={() =>
                    setExpandedProjectId((cur) => (cur === p.id ? null : p.id))
                  }
                  onSetRole={(email, role) => setProjectRole(p.id, email, role)}
                  onRemoveEmail={(email) => removeEmailFromProject(p.id, email)}
                  onSyncDocs={() => syncProjectDocs(p)}
                  authorizedEmails={emails.map((e) => e.email)}
                />
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      {emailToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-semibold text-zinc-900">Revoke Access</h3>
            </div>
            <p className="text-sm text-zinc-600 mb-6">
              Are you sure you want to revoke access for this email? They will no longer be able to
              sign in.
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

function ProjectAccessRow({
  project,
  expanded,
  onToggle,
  onSetRole,
  onRemoveEmail,
  onSyncDocs,
  authorizedEmails,
}: {
  project: Project;
  expanded: boolean;
  onToggle: () => void;
  onSetRole: (email: string, role: ProjectRole) => Promise<void>;
  onRemoveEmail: (email: string) => Promise<void>;
  onSyncDocs: () => Promise<void>;
  authorizedEmails: string[];
}) {
  const [input, setInput] = useState('');
  const [inputRole, setInputRole] = useState<ProjectRole>('viewer');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const members = project.allowedEmails || [];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = input.toLowerCase().trim();
    if (!email) return;
    setBusy(true);
    await onSetRole(email, inputRole);
    setBusy(false);
    setInput('');
    setInputRole('viewer');
  };

  return (
    <li>
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-500" />
          )}
          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-900">{project.name}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {members.length} member{members.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-5 pt-1 bg-zinc-50 border-t border-zinc-200">
          <form onSubmit={handleAdd} className="flex gap-2 mt-4">
            <input
              type="email"
              list={`authorized-emails-${project.id}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 rounded-lg border-zinc-300 focus:ring-zinc-500 focus:border-zinc-500 text-sm px-3 py-2 border"
            />
            <datalist id={`authorized-emails-${project.id}`}>
              {authorizedEmails
                .filter((e) => !members.includes(e))
                .map((e) => (
                  <option key={e} value={e} />
                ))}
            </datalist>
            <select
              value={inputRole}
              onChange={(e) => setInputRole(e.target.value as ProjectRole)}
              className="rounded-lg border-zinc-300 focus:ring-zinc-500 focus:border-zinc-500 text-sm px-3 py-2 border"
              title="Role"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4 mr-1.5" /> Grant
            </button>
          </form>

          {members.length === 0 ? (
            <p className="text-xs text-zinc-500 mt-4">
              No one has access to this project yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-1">
              {members.map((email) => {
                const authorized = authorizedEmails.includes(email);
                const role = projectRoleFor(project, email) || 'viewer';
                return (
                  <li
                    key={email}
                    className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-zinc-200 gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Shield
                        className={`w-4 h-4 flex-shrink-0 ${
                          authorized ? 'text-emerald-600' : 'text-amber-500'
                        }`}
                      />
                      <span className="text-sm text-zinc-800 truncate">{email}</span>
                      {!authorized && (
                        <span
                          className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"
                          title="Not in global authorized list — will be unable to sign in"
                        >
                          Not authorized
                        </span>
                      )}
                    </div>
                    <select
                      value={role}
                      onChange={(e) => onSetRole(email, e.target.value as ProjectRole)}
                      className="text-xs rounded border-zinc-300 px-2 py-1 border bg-white"
                      title="Role"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => onRemoveEmail(email)}
                      className="p-1.5 rounded-full text-red-600 hover:bg-red-50"
                      title="Remove access"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 pt-3 border-t border-zinc-200 flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              Private documents keep their own allowlists and aren&apos;t touched by sync.
            </p>
            <button
              onClick={async () => {
                setSyncing(true);
                await onSyncDocs();
                setSyncing(false);
              }}
              disabled={syncing}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900 disabled:opacity-50"
              title="Replace allowedEmails on every non-private document in this project with the current member list"
            >
              {syncing ? 'Syncing...' : 'Sync document access'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
