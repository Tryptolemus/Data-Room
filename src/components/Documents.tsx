import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  orderBy,
  getDocs,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  FileText,
  Upload,
  Trash2,
  Eye,
  File as FileIcon,
  Loader2,
  AlertTriangle,
  Lock,
  Unlock,
  Folder,
  FolderPlus,
  FolderUp,
  FolderOpen,
  ChevronRight,
  Plus,
  ArrowLeft,
  Home,
} from 'lucide-react';
import { format } from 'date-fns';
import { Link, useSearchParams } from 'react-router-dom';

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  allowedEmails: string[];
}

interface FolderItem {
  id: string;
  name: string;
  projectId: string;
  parentFolderId: string | null;
  createdAt: string;
  createdBy: string;
}

interface DocumentItem {
  id: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileType: string;
  uploadedAt: string;
  uploadedBy: string;
  size?: number;
  allowDownload?: boolean;
  projectId?: string;
  folderId?: string | null;
}

export default function Documents() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [searchParams, setSearchParams] = useSearchParams();
  const currentProjectId = searchParams.get('project');
  const currentFolderId = searchParams.get('folder');

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [projectLoading, setProjectLoading] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showUncategorized, setShowUncategorized] = useState(false);

  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<FolderItem | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Load projects list (scoped by access).
  useEffect(() => {
    if (!profile) return;

    let q;
    if (isAdmin) {
      q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    } else {
      q = query(
        collection(db, 'projects'),
        where('allowedEmails', 'array-contains', profile.email)
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Project[];
        items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setProjects(items);
        setProjectsLoading(false);
      },
      (error) => {
        console.error('Error fetching projects:', error);
        setProjectsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [profile, isAdmin]);

  // Load folders & documents for the current project.
  useEffect(() => {
    if (!currentProjectId) {
      setFolders([]);
      setDocuments([]);
      return;
    }
    setProjectLoading(true);

    const foldersQ = query(collection(db, 'folders'), where('projectId', '==', currentProjectId));
    const docsQ = query(collection(db, 'documents'), where('projectId', '==', currentProjectId));

    let foldersReady = false;
    let docsReady = false;
    const maybeDone = () => {
      if (foldersReady && docsReady) setProjectLoading(false);
    };

    const unsubF = onSnapshot(
      foldersQ,
      (snap) => {
        setFolders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FolderItem[]);
        foldersReady = true;
        maybeDone();
      },
      (err) => {
        console.error('Error fetching folders:', err);
        foldersReady = true;
        maybeDone();
      }
    );

    const unsubD = onSnapshot(
      docsQ,
      (snap) => {
        setDocuments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DocumentItem[]);
        docsReady = true;
        maybeDone();
      },
      (err) => {
        console.error('Error fetching documents:', err);
        docsReady = true;
        maybeDone();
      }
    );

    return () => {
      unsubF();
      unsubD();
    };
  }, [currentProjectId]);

  // Legacy uncategorized docs (admin only).
  const [legacyDocs, setLegacyDocs] = useState<DocumentItem[]>([]);
  useEffect(() => {
    if (!isAdmin || !showUncategorized) return;
    const q = query(collection(db, 'documents'), orderBy('uploadedAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DocumentItem[];
        setLegacyDocs(all.filter((d) => !d.projectId));
      },
      (err) => console.error('Error fetching legacy docs:', err)
    );
    return () => unsubscribe();
  }, [isAdmin, showUncategorized]);

  const currentProject = useMemo(
    () => projects.find((p) => p.id === currentProjectId) || null,
    [projects, currentProjectId]
  );

  const visibleFolders = useMemo(
    () => folders.filter((f) => (f.parentFolderId || null) === (currentFolderId || null)),
    [folders, currentFolderId]
  );

  const visibleDocuments = useMemo(
    () => documents.filter((d) => (d.folderId || null) === (currentFolderId || null)),
    [documents, currentFolderId]
  );

  const breadcrumb = useMemo(() => {
    if (!currentFolderId) return [] as FolderItem[];
    const byId = new Map(folders.map((f) => [f.id, f]));
    const chain: FolderItem[] = [];
    let cur: FolderItem | undefined = byId.get(currentFolderId);
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined;
    }
    return chain;
  }, [folders, currentFolderId]);

  const goToProjects = () => setSearchParams({});
  const goToProject = (projectId: string) => setSearchParams({ project: projectId });
  const goToFolder = (folderId: string | null) => {
    if (!currentProjectId) return;
    const next: Record<string, string> = { project: currentProjectId };
    if (folderId) next.folder = folderId;
    setSearchParams(next);
  };

  const handleCreateProject = async (name: string, description: string) => {
    if (!profile) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const ref = await addDoc(collection(db, 'projects'), {
        name: trimmed,
        description: description.trim(),
        createdAt: new Date().toISOString(),
        createdBy: profile.email,
        allowedEmails: [profile.email],
      });
      setCreatingProject(false);
      goToProject(ref.id);
    } catch (err) {
      console.error('Error creating project:', err);
      alert('Failed to create project.');
    }
  };

  const handleCreateFolder = async (name: string) => {
    if (!profile || !currentProjectId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await addDoc(collection(db, 'folders'), {
        name: trimmed,
        projectId: currentProjectId,
        parentFolderId: currentFolderId || null,
        createdAt: new Date().toISOString(),
        createdBy: profile.email,
      });
      setCreatingFolder(false);
    } catch (err) {
      console.error('Error creating folder:', err);
      alert('Failed to create folder.');
    }
  };

  // Ensure folder chain exists for a given relative path; returns the deepest folderId (or null for empty path).
  const ensureFolderPath = async (
    pathSegments: string[],
    cache: Map<string, string | null>
  ): Promise<string | null> => {
    if (!currentProjectId || !profile) return null;
    let parent: string | null = currentFolderId || null;
    let key = '';
    for (const segment of pathSegments) {
      key = key + '/' + segment;
      const cached = cache.get(key);
      if (cached !== undefined) {
        parent = cached;
        continue;
      }
      // Look in local state first for an existing folder match.
      const existing = folders.find(
        (f) => f.projectId === currentProjectId && (f.parentFolderId || null) === parent && f.name === segment
      );
      if (existing) {
        cache.set(key, existing.id);
        parent = existing.id;
        continue;
      }
      // Fall back to a one-shot query (in case onSnapshot hasn't caught up yet).
      const snap = await getDocs(
        query(
          collection(db, 'folders'),
          where('projectId', '==', currentProjectId),
          where('parentFolderId', '==', parent),
          where('name', '==', segment)
        )
      );
      if (!snap.empty) {
        const found = snap.docs[0];
        cache.set(key, found.id);
        parent = found.id;
        continue;
      }
      const created = await addDoc(collection(db, 'folders'), {
        name: segment,
        projectId: currentProjectId,
        parentFolderId: parent,
        createdAt: new Date().toISOString(),
        createdBy: profile.email,
      });
      cache.set(key, created.id);
      parent = created.id;
    }
    return parent;
  };

  const uploadFileList = async (files: FileList | File[]) => {
    if (!profile || !currentProjectId) return;
    const arr = Array.from(files);
    if (arr.length === 0) return;

    setUploading(true);
    setUploadError(null);
    setUploadProgress({ done: 0, total: arr.length });

    const folderCache = new Map<string, string | null>();

    try {
      for (const file of arr) {
        // webkitRelativePath is populated on folder uploads ("Root/Sub/file.pdf").
        const relPath = (file as any).webkitRelativePath as string | undefined;
        let folderId: string | null = currentFolderId || null;
        if (relPath && relPath.includes('/')) {
          const segments = relPath.split('/').filter(Boolean);
          const folderSegments = segments.slice(0, -1);
          folderId = await ensureFolderPath(folderSegments, folderCache);
        }

        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const storageRef = ref(
          storage,
          `documents/${currentProjectId}/${Date.now()}_${safeName}`
        );
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        await addDoc(collection(db, 'documents'), {
          title: file.name,
          description: '',
          fileUrl: url,
          fileType: file.type || 'application/octet-stream',
          uploadedAt: new Date().toISOString(),
          uploadedBy: profile.email,
          size: file.size,
          allowDownload: false,
          projectId: currentProjectId,
          folderId,
        });

        setUploadProgress((p) => (p ? { ...p, done: p.done + 1 } : null));
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      if (
        error?.code === 'storage/retry-limit-exceeded' ||
        error?.code === 'storage/unauthorized' ||
        error?.message?.includes('retry time')
      ) {
        setUploadError(
          'Upload failed. Firebase Storage might not be enabled or configured correctly. Check Storage rules allow authenticated reads/writes.'
        );
      } else {
        setUploadError('Upload failed: ' + (error?.message || 'Unknown error'));
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadFileList(files);
    }
    if (e.target) e.target.value = '';
  };

  const confirmDeleteDocument = async () => {
    if (!documentToDelete) return;
    try {
      await deleteDoc(doc(db, 'documents', documentToDelete.id));
      if (documentToDelete.fileUrl.includes('firebasestorage')) {
        try {
          const fileRef = ref(storage, documentToDelete.fileUrl);
          await deleteObject(fileRef);
        } catch (e) {
          console.warn('Storage delete failed (non-fatal):', e);
        }
      }
    } catch (error) {
      console.error('Error deleting document:', error);
    } finally {
      setDocumentToDelete(null);
    }
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    // Recursively collect this folder + all descendants.
    const toDelete = new Set<string>([folderToDelete.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of folders) {
        if (f.parentFolderId && toDelete.has(f.parentFolderId) && !toDelete.has(f.id)) {
          toDelete.add(f.id);
          changed = true;
        }
      }
    }
    try {
      // Delete documents inside these folders.
      const docsToDelete = documents.filter((d) => d.folderId && toDelete.has(d.folderId));
      for (const d of docsToDelete) {
        await deleteDoc(doc(db, 'documents', d.id));
        if (d.fileUrl.includes('firebasestorage')) {
          try {
            await deleteObject(ref(storage, d.fileUrl));
          } catch (e) {
            console.warn('Storage delete failed:', e);
          }
        }
      }
      for (const id of toDelete) {
        await deleteDoc(doc(db, 'folders', id));
      }
    } catch (err) {
      console.error('Error deleting folder:', err);
    } finally {
      setFolderToDelete(null);
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    const pid = projectToDelete.id;
    try {
      // Snapshot-based cleanup of all docs & folders in the project.
      const [docsSnap, foldersSnap] = await Promise.all([
        getDocs(query(collection(db, 'documents'), where('projectId', '==', pid))),
        getDocs(query(collection(db, 'folders'), where('projectId', '==', pid))),
      ]);
      for (const d of docsSnap.docs) {
        const data = d.data() as any;
        await deleteDoc(d.ref);
        if (typeof data.fileUrl === 'string' && data.fileUrl.includes('firebasestorage')) {
          try {
            await deleteObject(ref(storage, data.fileUrl));
          } catch (e) {
            console.warn('Storage delete failed:', e);
          }
        }
      }
      for (const f of foldersSnap.docs) {
        await deleteDoc(f.ref);
      }
      await deleteDoc(doc(db, 'projects', pid));
    } catch (err) {
      console.error('Error deleting project:', err);
    } finally {
      setProjectToDelete(null);
      if (currentProjectId === pid) goToProjects();
    }
  };

  const toggleDownload = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'documents', id), { allowDownload: !currentStatus });
    } catch (error) {
      console.error('Error toggling download:', error);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // ----- RENDER -----

  if (!currentProjectId) {
    return (
      <div className="space-y-6 relative">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Projects</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {isAdmin
                ? 'Organize documents into projects and grant access per project.'
                : 'Projects shared with you.'}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setCreatingProject(true)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-white bg-zinc-900 hover:bg-zinc-800 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" /> New Project
            </button>
          )}
        </div>

        {projectsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-zinc-200 border-dashed">
            <FolderOpen className="mx-auto h-12 w-12 text-zinc-300" />
            <h3 className="mt-2 text-sm font-medium text-zinc-900">No projects yet</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {isAdmin
                ? 'Create your first project to start organizing documents.'
                : 'No projects have been shared with you yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm hover:shadow-md transition-shadow group"
              >
                <button
                  onClick={() => goToProject(p.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 flex-shrink-0">
                      <FolderOpen className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-zinc-900 truncate">{p.name}</h3>
                      {p.description && (
                        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{p.description}</p>
                      )}
                      <p className="text-xs text-zinc-400 mt-2">
                        Created {format(new Date(p.createdAt), 'MMM d, yyyy')}
                        {isAdmin && p.allowedEmails && (
                          <> &bull; {p.allowedEmails.length} member{p.allowedEmails.length === 1 ? '' : 's'}</>
                        )}
                      </p>
                    </div>
                  </div>
                </button>
                {isAdmin && (
                  <div className="mt-4 pt-3 border-t border-zinc-100 flex justify-end">
                    <button
                      onClick={() => setProjectToDelete(p)}
                      className="inline-flex items-center text-xs text-red-600 hover:text-red-800"
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <div className="pt-4 border-t border-zinc-200">
            <button
              onClick={() => setShowUncategorized((s) => !s)}
              className="text-xs text-zinc-500 hover:text-zinc-700"
            >
              {showUncategorized ? 'Hide' : 'Show'} uncategorized legacy documents
            </button>
            {showUncategorized && (
              <div className="mt-4 bg-white rounded-2xl border border-zinc-200 border-dashed overflow-hidden">
                {legacyDocs.length === 0 ? (
                  <p className="p-6 text-sm text-zinc-500 text-center">
                    No uncategorized documents.
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-200">
                    {legacyDocs.map((d) => (
                      <li
                        key={d.id}
                        className="px-6 py-3 flex items-center justify-between hover:bg-zinc-50"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                          <span className="text-sm text-zinc-900 truncate">{d.title}</span>
                          <span className="text-xs text-zinc-500 flex-shrink-0">
                            {format(new Date(d.uploadedAt), 'MMM d, yyyy')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Link
                            to={`/view/${d.id}`}
                            className="p-1.5 rounded text-zinc-600 hover:bg-zinc-100"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => setDocumentToDelete(d)}
                            className="p-1.5 rounded text-red-600 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {creatingProject && (
          <ProjectFormModal
            onClose={() => setCreatingProject(false)}
            onSubmit={handleCreateProject}
          />
        )}

        {projectToDelete && (
          <ConfirmModal
            title="Delete Project"
            message={`Delete "${projectToDelete.name}"? This removes the project along with all its folders and documents. This cannot be undone.`}
            onCancel={() => setProjectToDelete(null)}
            onConfirm={confirmDeleteProject}
          />
        )}

        {documentToDelete && (
          <ConfirmModal
            title="Delete Document"
            message="Are you sure? This cannot be undone."
            onCancel={() => setDocumentToDelete(null)}
            onConfirm={confirmDeleteDocument}
          />
        )}
      </div>
    );
  }

  // ---- Inside a project ----

  if (!currentProject && !projectLoading) {
    return (
      <div className="space-y-6">
        <button
          onClick={goToProjects}
          className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to projects
        </button>
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 text-center">
          <ShieldAlertIcon />
          <h3 className="mt-2 text-sm font-medium text-zinc-900">Project unavailable</h3>
          <p className="mt-1 text-sm text-zinc-500">
            It may have been deleted or you no longer have access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      <div>
        <button
          onClick={goToProjects}
          className="inline-flex items-center text-xs text-zinc-500 hover:text-zinc-900 mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> All projects
        </button>

        <div className="flex items-center gap-1.5 text-sm text-zinc-500 flex-wrap">
          <button
            onClick={() => goToFolder(null)}
            className="inline-flex items-center hover:text-zinc-900 font-medium text-zinc-700"
          >
            <Home className="w-3.5 h-3.5 mr-1" />
            {currentProject?.name || 'Project'}
          </button>
          {breadcrumb.map((f) => (
            <React.Fragment key={f.id}>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-300" />
              <button
                onClick={() => goToFolder(f.id)}
                className="hover:text-zinc-900"
              >
                {f.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex items-start justify-between mt-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">
              {breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].name : currentProject?.name}
            </h1>
            {!breadcrumb.length && currentProject?.description && (
              <p className="text-sm text-zinc-500 mt-1">{currentProject.description}</p>
            )}
          </div>
          {isAdmin && (
            <div className="flex gap-2 flex-wrap justify-end">
              <button
                onClick={() => setCreatingFolder(true)}
                className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700"
              >
                <FolderPlus className="w-4 h-4 mr-2" /> New Folder
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={handleFileInput}
                disabled={uploading}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.txt,.csv,.zip"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700 disabled:opacity-50"
              >
                <Upload className="w-4 h-4 mr-2" /> Upload Files
              </button>
              <input
                ref={folderInputRef}
                type="file"
                className="hidden"
                multiple
                {...({ webkitdirectory: '', directory: '' } as any)}
                onChange={handleFileInput}
                disabled={uploading}
              />
              <button
                onClick={() => folderInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg shadow-sm text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50"
              >
                <FolderUp className="w-4 h-4 mr-2" /> Upload Folder
              </button>
            </div>
          )}
        </div>
      </div>

      {uploading && uploadProgress && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-800 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          Uploading {uploadProgress.done + 1} of {uploadProgress.total}...
        </div>
      )}

      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800">Upload Error</h3>
            <p className="mt-1 text-sm text-red-700">{uploadError}</p>
          </div>
          <button onClick={() => setUploadError(null)} className="text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {projectLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      ) : visibleFolders.length === 0 && visibleDocuments.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-zinc-200 border-dashed">
          <FileIcon className="mx-auto h-12 w-12 text-zinc-300" />
          <h3 className="mt-2 text-sm font-medium text-zinc-900">Empty folder</h3>
          <p className="mt-1 text-sm text-zinc-500">
            {isAdmin ? 'Create a folder or upload documents to get started.' : 'Nothing here yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 overflow-hidden">
          <ul className="divide-y divide-zinc-200">
            {visibleFolders
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((f) => (
                <li key={f.id} className="hover:bg-zinc-50 transition-colors">
                  <div className="px-6 py-4 flex items-center justify-between">
                    <button
                      onClick={() => goToFolder(f.id)}
                      className="flex items-center min-w-0 gap-4 flex-1 text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 flex-shrink-0">
                        <Folder className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-900 truncate">{f.name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Folder &bull; Created {format(new Date(f.createdAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => setFolderToDelete(f)}
                        className="ml-4 p-2 rounded-full text-red-700 bg-red-50 hover:bg-red-100"
                        title="Delete folder"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            {visibleDocuments
              .slice()
              .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))
              .map((d) => (
                <li key={d.id} className="hover:bg-zinc-50 transition-colors">
                  <div className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center min-w-0 gap-4">
                      <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 flex-shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-900 truncate">{d.title}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                          <span>{format(new Date(d.uploadedAt), 'MMM d, yyyy')}</span>
                          <span>&bull;</span>
                          <span>{formatBytes(d.size || 0)}</span>
                          {isAdmin && (
                            <>
                              <span>&bull;</span>
                              <span className="truncate">By {d.uploadedBy}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      <Link
                        to={`/view/${d.id}`}
                        className="inline-flex items-center p-2 rounded-full text-zinc-700 bg-zinc-100 hover:bg-zinc-200"
                        title="View Document"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => toggleDownload(d.id, !!d.allowDownload)}
                            className={`inline-flex items-center p-2 rounded-full ${
                              d.allowDownload
                                ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                                : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                            }`}
                            title={
                              d.allowDownload
                                ? 'Downloads Allowed (Click to Restrict)'
                                : 'Downloads Restricted (Click to Allow)'
                            }
                          >
                            {d.allowDownload ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => setDocumentToDelete(d)}
                            className="inline-flex items-center p-2 rounded-full text-red-700 bg-red-50 hover:bg-red-100"
                            title="Delete Document"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}

      {creatingFolder && (
        <FolderFormModal
          onClose={() => setCreatingFolder(false)}
          onSubmit={handleCreateFolder}
        />
      )}

      {documentToDelete && (
        <ConfirmModal
          title="Delete Document"
          message="Are you sure? This cannot be undone."
          onCancel={() => setDocumentToDelete(null)}
          onConfirm={confirmDeleteDocument}
        />
      )}

      {folderToDelete && (
        <ConfirmModal
          title="Delete Folder"
          message={`Delete "${folderToDelete.name}" and all its contents? This cannot be undone.`}
          onCancel={() => setFolderToDelete(null)}
          onConfirm={confirmDeleteFolder}
        />
      )}
    </div>
  );
}

// ---- Small reusable bits ----

function ShieldAlertIcon() {
  return <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />;
}

function ConfirmModal({
  title,
  message,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <div className="flex items-center gap-3 text-red-600 mb-4">
          <AlertTriangle className="w-6 h-6" />
          <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
        </div>
        <p className="text-sm text-zinc-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectFormModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit(name, description);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl"
      >
        <h3 className="text-lg font-semibold text-zinc-900 mb-4">New Project</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Name</label>
            <input
              autoFocus
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full rounded-lg border-zinc-300 focus:ring-zinc-500 focus:border-zinc-500 sm:text-sm px-3 py-2 border"
              placeholder="e.g., Series A Due Diligence"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="block w-full rounded-lg border-zinc-300 focus:ring-zinc-500 focus:border-zinc-500 sm:text-sm px-3 py-2 border"
            />
          </div>
          <p className="text-xs text-zinc-500">
            You can grant access to specific emails from the Access Control page after the project
            is created.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function FolderFormModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit(name);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl"
      >
        <h3 className="text-lg font-semibold text-zinc-900 mb-4">New Folder</h3>
        <input
          autoFocus
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="block w-full rounded-lg border-zinc-300 focus:ring-zinc-500 focus:border-zinc-500 sm:text-sm px-3 py-2 border"
          placeholder="Folder name"
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
