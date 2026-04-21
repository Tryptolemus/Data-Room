import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, useCanViewAnalytics } from '../contexts/AuthContext';
import { db } from '../firebase';
import { Navigate } from 'react-router-dom';
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
  const canViewAnalytics = useCanViewAnalytics();

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

  // ---- Derived stats ----
  const stats = useMemo(() => {
    const views = filteredEvents.filter((e) => e.action === 'view');
    const downloads = filteredEvents.filter((e) => e.action === 'download');
    const durationsWithValue = views.filter((e) => typeof e.durationSeconds === 'number');
    const avgDuration =
      durationsWithValue.length === 0
        ? 0
        : Math.round(
            durationsWithValue.reduce((acc, e) => acc + (e.durationSeconds || 0), 0) /
              durationsWithValue.length
          );
    const uniqueViewers = new Set(filteredEvents.map((e) => e.userId)).size;
    return {
      totalViews: views.length,
      totalDownloads: downloads.length,
      uniqueViewers,
      avgDuration,
    };
  }, [filteredEvents]);

  // Views per day for the last 30 days.
  const viewsByDay = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        date: key,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        count: 0,
      });
    }
    const idx = new Map(days.map((d, i) => [d.date, i]));
    filteredEvents
      .filter((e) => e.action === 'view')
      .forEach((e) => {
        const key = e.timestamp.slice(0, 10);
        const i = idx.get(key);
        if (i !== undefined) days[i].count += 1;
      });
    return days;
  }, [filteredEvents]);

  const topDocuments = useMemo(() => {
    const counts = new Map<string, number>();
    filteredEvents
      .filter((e) => e.action === 'view')
      .forEach((e) => counts.set(e.documentId, (counts.get(e.documentId) || 0) + 1));
    return Array.from(counts.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredEvents]);

  const topViewers = useMemo(() => {
    const counts = new Map<string, number>();
    filteredEvents
      .filter((e) => e.action === 'view')
      .forEach((e) => counts.set(e.userId, (counts.get(e.userId) || 0) + 1));
    return Array.from(counts.entries())
      .map(([email, count]) => ({ email, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredEvents]);

  if (canViewAnalytics === null) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }
  if (!canViewAnalytics) {
    return <Navigate to="/" replace />;
  }

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

      {!(eventsLoading || projectsLoading) && filteredEvents.length > 0 && (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatTile label="Views" value={stats.totalViews.toLocaleString()} accent="indigo" />
            <StatTile
              label="Downloads"
              value={stats.totalDownloads.toLocaleString()}
              accent="emerald"
            />
            <StatTile
              label="Unique viewers"
              value={stats.uniqueViewers.toLocaleString()}
              accent="amber"
            />
            <StatTile
              label="Avg view time"
              value={formatDuration(stats.avgDuration)}
              accent="purple"
            />
          </div>

          {/* Trend + rankings */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 sm:p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-zinc-900">Views over last 30 days</h3>
                <span className="text-xs text-zinc-500">
                  {viewsByDay.reduce((acc, d) => acc + d.count, 0)} views
                </span>
              </div>
              <TrendChart data={viewsByDay} />
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-zinc-900 mb-3">Top documents</h3>
              <BarList
                items={topDocuments.map((d) => ({
                  key: d.id,
                  label: docTitles[d.id] || d.id,
                  value: d.count,
                }))}
                color="bg-indigo-500"
                emptyLabel="No views yet."
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Top viewers</h3>
            <BarList
              items={topViewers.map((v) => ({ key: v.email, label: v.email, value: v.count }))}
              color="bg-emerald-500"
              emptyLabel="No viewers yet."
            />
          </div>
        </>
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

function StatTile({ label, value, accent }: { label: string; value: string; accent: 'indigo' | 'emerald' | 'amber' | 'purple' }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    purple: 'bg-purple-50 text-purple-700',
  } as const;
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4">
      <div className={`text-xs font-medium uppercase tracking-wider inline-flex px-2 py-0.5 rounded ${colors[accent]}`}>{label}</div>
      <div className="mt-2 text-2xl font-bold text-zinc-900">{value}</div>
    </div>
  );
}

function TrendChart({ data }: { data: { date: string; label: string; count: number }[] }) {
  const width = 600;
  const height = 140;
  const padX = 24;
  const padY = 12;
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const stepX = (width - padX * 2) / Math.max(1, data.length - 1);
  const yFor = (c: number) => height - padY - ((c / maxCount) * (height - padY * 2));
  const points = data.map((d, i) => [padX + i * stepX, yFor(d.count)] as const);
  const linePath = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1][0]},${height - padY} L${points[0][0]},${height - padY} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#trendFill)" />
      <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={data[i].count > 0 ? 2.5 : 0} fill="#6366f1" />
      ))}
      {[0, Math.floor(data.length / 2), data.length - 1].map((i) => (
        <text
          key={i}
          x={padX + i * stepX}
          y={height - 2}
          textAnchor="middle"
          fontSize={10}
          fill="#71717a"
        >
          {data[i]?.label}
        </text>
      ))}
    </svg>
  );
}

function BarList({
  items,
  color,
  emptyLabel,
}: {
  items: { key: string; label: string; value: number }[];
  color: string;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-zinc-500">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const pct = Math.max(4, (it.value / max) * 100);
        return (
          <li key={it.key}>
            <div className="flex items-baseline justify-between text-xs text-zinc-700 mb-1">
              <span className="truncate mr-2" title={it.label}>{it.label}</span>
              <span className="font-medium text-zinc-900 flex-shrink-0">{it.value}</span>
            </div>
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div className={`${color} h-full rounded-full`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

