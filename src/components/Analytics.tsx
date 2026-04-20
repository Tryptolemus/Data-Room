import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import {
  collection,
  query,
  onSnapshot,
  where,
  orderBy,
  Query,
  DocumentData,
} from 'firebase/firestore';
import { Download, Eye, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface Project {
  id: string;
  name: string;
  allowedEmails: string[];
  editorEmails?: string[];
  adminEmails?: string[];
}

interface AnalyticsEvent {
  id: string;
  documentId: string;
  userId: string;
  action: 'view' | 'download';
  durationSeconds?: number;
  timestamp: string;
  projectId?: string;
}

export default function Analytics() {
  const { profile } = useAuth();
  const isGlobalAdmin = profile?.role === 'admin';

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const [docTitles, setDocTitles] = useState<Record<string, string>>({});

  // Load projects the user can access.
  useEffect(() => {
    if (!profile) return;
    const q: Query<DocumentData> = isGlobalAdmin
      ? query(collection(db, 'projects'), orderBy('createdAt', 'desc'))
      : query(
          collection(db, 'projects'),
          where('allowedEmails', 'array-contains', profile.email)
        );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setProjects(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Project[]
        );
        setProjectsLoading(false);
      },
      (err) => {
        console.error('Error loading projects for analytics:', err);
        setProjectsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [profile, isGlobalAdmin]);

  // Load analytics events.
  useEffect(() => {
    if (!profile || projectsLoading) return;

    let q: Query<DocumentData>;
    if (isGlobalAdmin) {
      // Admin sees everything (including legacy events without projectId).
      q = query(collection(db, 'analytics'), orderBy('timestamp', 'desc'));
    } else {
      const accessibleIds = projects.map((p) => p.id);
      if (accessibleIds.length === 0) {
        setEvents([]);
        setEventsLoading(false);
        return;
      }
      // Firestore 'in' filter caps at 30 values.
      const scope = accessibleIds.slice(0, 30);
      q = query(collection(db, 'analytics'), where('projectId', 'in', scope));
    }

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AnalyticsEvent[];
        all.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
        setEvents(all);
        setEventsError(null);
        setEventsLoading(false);
      },
      (err: any) => {
        console.error('Error loading analytics:', err);
        setEventsError(
          err?.code === 'permission-denied'
            ? 'Permission denied. The updated firestore.rules may not be deployed yet.'
            : err?.message || 'Failed to load analytics.'
        );
        setEventsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [profile, isGlobalAdmin, projects, projectsLoading]);

  // Lazy-load document titles to make the table readable.
  useEffect(() => {
    const needed = Array.from(
      new Set(events.map((e) => e.documentId).filter((id) => id && !(id in docTitles)))
    );
    if (needed.length === 0) return;

    import('firebase/firestore').then(({ getDoc, doc }) => {
      needed.forEach(async (docId) => {
        try {
          const snap = await getDoc(doc(db, 'documents', docId));
          if (snap.exists()) {
            const data = snap.data() as any;
            setDocTitles((prev) => ({ ...prev, [docId]: data.title || docId }));
          } else {
            setDocTitles((prev) => ({ ...prev, [docId]: '(deleted)' }));
          }
        } catch {
          setDocTitles((prev) => ({ ...prev, [docId]: docId }));
        }
      });
    });
  }, [events, docTitles]);

  const filteredEvents = useMemo(() => {
    if (selectedProjectId === 'all') return events;
    return events.filter((e) => e.projectId === selectedProjectId);
  }, [events, selectedProjectId]);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Analytics</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {isGlobalAdmin
              ? 'Track document views, view durations, and downloads across all projects.'
              : 'Views and downloads on projects you have access to.'}
          </p>
        </div>
        {projects.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Project</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="rounded-lg border-zinc-300 focus:ring-zinc-500 focus:border-zinc-500 text-sm px-3 py-2 border bg-white"
            >
              <option value="all">All accessible projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {eventsError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800">Can&apos;t load analytics</h3>
            <p className="mt-1 text-sm text-red-700">{eventsError}</p>
          </div>
        </div>
      )}

      {eventsLoading || projectsLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    User
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Document
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-zinc-200">
                {filteredEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {event.action === 'view' ? (
                          <Eye className="w-4 h-4 text-indigo-500 mr-2" />
                        ) : (
                          <Download className="w-4 h-4 text-emerald-500 mr-2" />
                        )}
                        <span className="text-sm font-medium text-zinc-900 capitalize">
                          {event.action}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-zinc-900">{event.userId}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className="text-sm text-zinc-800 truncate max-w-[260px]"
                        title={docTitles[event.documentId] || event.documentId}
                      >
                        {docTitles[event.documentId] || event.documentId}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-zinc-500">
                        {event.action === 'view' && (
                          <>
                            <Clock className="w-3 h-3 mr-1" />
                            {formatDuration(event.durationSeconds)}
                          </>
                        )}
                        {event.action !== 'view' && '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                      {format(new Date(event.timestamp), 'MMM d, yyyy HH:mm')}
                    </td>
                  </tr>
                ))}
                {filteredEvents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-zinc-500">
                      No analytics data available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
