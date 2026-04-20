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
  Query,
  DocumentData,
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
  Move,
  GripVertical,
  Pencil,
  EyeOff,
  Users,
} from 'lucide-react';

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function nextOrderValue<T extends { order?: number }>(items: T[]): number {
  const max = items.reduce(
    (acc, x) => (typeof x.order === 'number' && x.order > acc ? x.order : acc),
    0
  );
  return max + 1000;
}
import { format } from 'date-fns';
import { Link, useSearchParams } from 'react-router-dom';

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

function projectRoleFor(
  project: Project | undefined,
  email: string | undefined
): 'admin' | 'editor' | 'viewer' | null {
  if (!project || !email) return null;
  if ((project.adminEmails || []).includes(email)) return 'admin';
  if ((project.editorEmails || []).includes(email)) return 'editor';
  if ((project.allowedEmails || []).includes(email)) return 'viewer';
  return null;
}

interface FolderItem {
  id: string;
  name: string;
  projectId: string;
  parentFolderId: string | null;
  createdAt: string;
  createdBy: string;
  order?: number;
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
  visibility?: 'project' | 'restricted';
  allowedEmails?: string[];
  order?: number;
}

export default function Documents() {
  const { profile } = useAuth();
  const isGlobalAdmin = profile?.role === 'admin';

  const [searchParams, setSearchParams] = useSearchParams();
  const currentProjectId = searchParams.get('project');
  const currentFolderId = searchParams.get('folder');

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);

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

  type RenameTarget =
    | { kind: 'project'; id: string; currentName: string }
    | { kind: 'folder'; id: string; currentName: string }
    | { kind: 'document'; id: string; currentName: string };
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);

  const [visibilityTarget, setVisibilityTarget] = useState<DocumentItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Load projects list (scoped by access).
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
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Project[];
        items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setProjects(items);
        setProjectsError(null);
        setProjectsLoading(false);
      },
      (error: any) => {
        console.error('Error fetching projects:', error);
        setProjectsError(
          error?.code === 'permission-denied'
            ? 'Permission denied reading projects. The updated firestore.rules need to be deployed to Firebase.'
            : error?.message || 'Failed to load projects.'
        );
        setProjectsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [profile, isGlobalAdmin]);

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
    if (!isGlobalAdmin || !showUncategorized) return;
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
  }, [isGlobalAdmin, showUncategorized]);

  const currentProject = useMemo(
    () => projects.find((p) => p.id === currentProjectId) || null,
    [projects, currentProjectId]
  );

  const currentProjectRole = useMemo(
    () => projectRoleFor(currentProject || undefined, profile?.email),
    [currentProject, profile?.email]
  );
  const canEditCurrentProject =
    isGlobalAdmin || currentProjectRole === 'editor' || currentProjectRole === 'admin';
  const canAdminCurrentProject = isGlobalAdmin || currentProjectRole === 'admin';

  const canAdminProject = (p: Project) =>
    isGlobalAdmin || (profile?.email ? (p.adminEmails || []).includes(profile.email) : false);

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

  // ---- Drag & drop (admin only) ----
  type DragItem = { type: 'document' | 'folder'; id: string };
  type DropZone =
    | { kind: 'into'; id: string | 'root' }
    | { kind: 'before' | 'after'; id: string; rowType: 'folder' | 'document' };
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [dropZone, setDropZone] = useState<DropZone | null>(null);
  const [docToMigrate, setDocToMigrate] = useState<DocumentItem | null>(null);

  const isFolderDescendantOf = (candidateId: string, ancestorId: string): boolean => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    let cur = byId.get(candidateId);
    while (cur) {
      if (cur.id === ancestorId) return true;
      if (!cur.parentFolderId) return false;
      cur = byId.get(cur.parentFolderId);
    }
    return false;
  };

  const moveDocument = async (docId: string, targetFolderId: string | null) => {
    try {
      await updateDoc(doc(db, 'documents', docId), { folderId: targetFolderId });
    } catch (err) {
      console.error('Error moving document:', err);
      alert('Failed to move document.');
    }
  };

  const moveFolder = async (folderId: string, targetParentId: string | null) => {
    if (targetParentId && isFolderDescendantOf(targetParentId, folderId)) {
      alert('Cannot move a folder into itself or one of its subfolders.');
      return;
    }
    try {
      await updateDoc(doc(db, 'folders', folderId), { parentFolderId: targetParentId });
    } catch (err) {
      console.error('Error moving folder:', err);
      alert('Failed to move folder.');
    }
  };

  const updateVisibility = async (
    docId: string,
    visibility: 'project' | 'restricted',
    allowedEmails: string[]
  ) => {
    try {
      await updateDoc(doc(db, 'documents', docId), {
        visibility,
        allowedEmails,
      });
    } catch (err: any) {
      console.error('Error updating visibility:', err);
      alert('Failed to update visibility: ' + (err?.message || 'unknown error'));
    }
  };

  const renameItem = async (target: RenameTarget, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === target.currentName) return;
    try {
      if (target.kind === 'project') {
        await updateDoc(doc(db, 'projects', target.id), { name: trimmed });
      } else if (target.kind === 'folder') {
        await updateDoc(doc(db, 'folders', target.id), { name: trimmed });
      } else {
        await updateDoc(doc(db, 'documents', target.id), { title: trimmed });
      }
    } catch (err: any) {
      console.error('Error renaming item:', err);
      alert('Failed to rename: ' + (err?.message || 'unknown error'));
    }
  };

  const migrateDocument = async (
    docId: string,
    targetProjectId: string,
    targetFolderId: string | null
  ) => {
    try {
      const targetProject = projects.find((p) => p.id === targetProjectId);
      await updateDoc(doc(db, 'documents', docId), {
        projectId: targetProjectId,
        folderId: targetFolderId,
        visibility: 'project',
        allowedEmails: targetProject?.allowedEmails || [],
      });
    } catch (err: any) {
      console.error('Error migrating document:', err);
      alert('Failed to migrate: ' + (err?.message || 'unknown error'));
    }
  };

  // Shared drag handlers.
  const handleDragStart = (item: DragItem) => (e: React.DragEvent) => {
    setDragging(item);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', `${item.type}:${item.id}`);
    } catch {
      /* ignore */
    }
  };
  const handleDragEnd = () => {
    setDragging(null);
    setDropZone(null);
  };

  // Row-level drag over: computes before/into/after based on pointer Y.
  const handleRowDragOver = (rowId: string, rowType: 'folder' | 'document') =>
    (e: React.DragEvent<HTMLLIElement>) => {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const ratio = y / rect.height;
      if (rowType === 'folder') {
        // Top 25% = before, bottom 25% = after, middle = into.
        if (ratio < 0.25) setDropZone({ kind: 'before', id: rowId, rowType });
        else if (ratio > 0.75) setDropZone({ kind: 'after', id: rowId, rowType });
        else setDropZone({ kind: 'into', id: rowId });
      } else {
        // Documents only support before/after.
        if (ratio < 0.5) setDropZone({ kind: 'before', id: rowId, rowType });
        else setDropZone({ kind: 'after', id: rowId, rowType });
      }
    };

  // Drop handler for the home/breadcrumb (always "into a folder or root").
  const handleIntoDragOver = (id: string | 'root') => (e: React.DragEvent) => {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropZone({ kind: 'into', id });
  };

  const handleIntoDrop = (folderId: string | null) => async (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragging) return;
    const { type, id } = dragging;
    setDragging(null);
    setDropZone(null);
    if (type === 'document') {
      const current = documents.find((d) => d.id === id);
      if (current && (current.folderId || null) === folderId) return;
      await moveDocument(id, folderId);
    } else if (type === 'folder') {
      if (id === folderId) return;
      const current = folders.find((f) => f.id === id);
      if (current && (current.parentFolderId || null) === folderId) return;
      await moveFolder(id, folderId);
    }
  };

  const handleRowDrop = (rowId: string, rowType: 'folder' | 'document') =>
    async (e: React.DragEvent) => {
      e.preventDefault();
      const zone = dropZone;
      if (!dragging || !zone) return;
      const { type: dragType, id: dragId } = dragging;
      setDragging(null);
      setDropZone(null);

      if (zone.kind === 'into' && rowType === 'folder') {
        // Move into folder.
        if (dragType === 'folder' && dragId === rowId) return;
        if (dragType === 'folder' && isFolderDescendantOf(rowId, dragId)) {
          alert('Cannot move a folder into itself or one of its subfolders.');
          return;
        }
        if (dragType === 'document') await moveDocument(dragId, rowId);
        else await moveFolder(dragId, rowId);
        return;
      }

      // Reorder (before/after this row).
      await reorderItem(dragging, { kind: zone.kind as 'before' | 'after', id: rowId, rowType });
    };

  // Reorder: compute a new `order` for the dragged item that slots it before/after target.
  const reorderItem = async (
    drag: DragItem,
    zone: { kind: 'before' | 'after'; id: string; rowType: 'folder' | 'document' }
  ) => {
    // Use the full set of siblings (folders + docs share ordering within a container
    // but we keep them separate because they render in two groups).
    const siblings: Array<{ id: string; order?: number }> =
      drag.type === 'folder'
        ? folders
            .filter((f) => (f.parentFolderId || null) === (currentFolderId || null))
            .map((f) => ({ id: f.id, order: f.order }))
        : documents
            .filter((d) => (d.folderId || null) === (currentFolderId || null))
            .map((d) => ({ id: d.id, order: d.order }));

    // If dragging across types (folder vs document), just nudge against target's order.
    if (
      (drag.type === 'folder' && zone.rowType !== 'folder') ||
      (drag.type === 'document' && zone.rowType !== 'document')
    ) {
      const targetItem =
        zone.rowType === 'folder'
          ? folders.find((f) => f.id === zone.id)
          : documents.find((d) => d.id === zone.id);
      if (!targetItem) return;
      const base = targetItem.order ?? 1000;
      const newOrder = zone.kind === 'before' ? base - 0.5 : base + 0.5;
      if (drag.type === 'folder') {
        await updateDoc(doc(db, 'folders', drag.id), { order: newOrder });
      } else {
        await updateDoc(doc(db, 'documents', drag.id), { order: newOrder });
      }
      return;
    }

    // Same-type reorder: compute midpoint between neighbors.
    const sorted = siblings
      .slice()
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
    const filtered = sorted.filter((s) => s.id !== drag.id);
    const targetIdx = filtered.findIndex((s) => s.id === zone.id);
    if (targetIdx === -1) return;
    const insertIdx = zone.kind === 'before' ? targetIdx : targetIdx + 1;
    const aboveOrder = filtered[insertIdx - 1]?.order;
    const belowOrder = filtered[insertIdx]?.order;
    let newOrder: number;
    if (aboveOrder == null && belowOrder == null) newOrder = 1000;
    else if (aboveOrder == null) newOrder = (belowOrder as number) - 1000;
    else if (belowOrder == null) newOrder = aboveOrder + 1000;
    else newOrder = (aboveOrder + belowOrder) / 2;

    try {
      if (drag.type === 'folder') {
        await updateDoc(doc(db, 'folders', drag.id), { order: newOrder });
      } else {
        await updateDoc(doc(db, 'documents', drag.id), { order: newOrder });
      }
    } catch (err) {
      console.error('Error reordering:', err);
      alert('Failed to reorder.');
    }
  };

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
        editorEmails: [],
        adminEmails: [profile.email],
      });
      setCreatingProject(false);
      goToProject(ref.id);
    } catch (err: any) {
      console.error('Error creating project:', err);
      const msg =
        err?.code === 'permission-denied'
          ? 'Permission denied. The updated firestore.rules need to be deployed to Firebase before projects can be created.'
          : err?.message || 'Failed to create project.';
      alert(msg);
    }
  };

  const handleCreateFolder = async (name: string) => {
    if (!profile || !currentProjectId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const siblingFolders = folders.filter(
        (f) => (f.parentFolderId || null) === (currentFolderId || null)
      );
      const nextOrder = nextOrderValue(siblingFolders);
      await addDoc(collection(db, 'folders'), {
        name: trimmed,
        projectId: currentProjectId,
        parentFolderId: currentFolderId || null,
        createdAt: new Date().toISOString(),
        createdBy: profile.email,
        order: nextOrder,
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
      const siblingFolders = folders.filter(
        (f) => f.projectId === currentProjectId && (f.parentFolderId || null) === parent
      );
      const created = await addDoc(collection(db, 'folders'), {
        name: segment,
        projectId: currentProjectId,
        parentFolderId: parent,
        createdAt: new Date().toISOString(),
        createdBy: profile.email,
        order: nextOrderValue(siblingFolders),
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
    const projectAllowedEmails = currentProject?.allowedEmails || [profile.email];

    // Seed base order off the current folder's existing docs so uploads append to the end.
    let orderCursor = nextOrderValue(
      documents.filter((d) => (d.folderId || null) === (currentFolderId || null))
    );

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
          visibility: 'project',
          allowedEmails: projectAllowedEmails,
          order: orderCursor,
        });
        orderCursor += 1000;

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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Projects</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {isGlobalAdmin
                ? 'Organize documents into projects and grant access per project.'
                : 'Projects shared with you.'}
            </p>
          </div>
          {isGlobalAdmin && (
            <button
              onClick={() => setCreatingProject(true)}
              className="inline-flex items-center px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg shadow-sm text-white bg-zinc-900 hover:bg-zinc-800 transition-colors flex-shrink-0"
            >
              <Plus className="w-4 h-4 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">New </span>Project
            </button>
          )}
        </div>

        {projectsError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-800">Can&apos;t load projects</h3>
              <p className="mt-1 text-sm text-red-700">{projectsError}</p>
            </div>
          </div>
        )}

        {projectsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-zinc-200 border-dashed">
            <FolderOpen className="mx-auto h-12 w-12 text-zinc-300" />
            <h3 className="mt-2 text-sm font-medium text-zinc-900">No projects yet</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {isGlobalAdmin
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
                        {p.allowedEmails && (
                          <> &bull; {p.allowedEmails.length} member{p.allowedEmails.length === 1 ? '' : 's'}</>
                        )}
                        {(() => {
                          const role = projectRoleFor(p, profile?.email);
                          if (!role || isGlobalAdmin) return null;
                          return (
                            <> &bull; <span className="capitalize">{role}</span></>
                          );
                        })()}
                      </p>
                    </div>
                  </div>
                </button>
                {canAdminProject(p) && (
                  <div className="mt-4 pt-3 border-t border-zinc-100 flex justify-between">
                    <button
                      onClick={() =>
                        setRenameTarget({ kind: 'project', id: p.id, currentName: p.name })
                      }
                      className="inline-flex items-center text-xs text-zinc-600 hover:text-zinc-900"
                      title="Rename project"
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Rename
                    </button>
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

        {isGlobalAdmin && (
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
                    {legacyDocs
                      .slice()
                      .sort((a, b) => naturalCompare(a.title, b.title))
                      .map((d) => (
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
                            <button
                              onClick={() => setDocToMigrate(d)}
                              className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                              title="Move to a project"
                            >
                              <Move className="w-3.5 h-3.5 mr-1" /> Move to project
                            </button>
                            <button
                              onClick={() =>
                                setRenameTarget({
                                  kind: 'document',
                                  id: d.id,
                                  currentName: d.title,
                                })
                              }
                              className="p-1.5 rounded text-zinc-600 hover:bg-zinc-100"
                              title="Rename"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
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

        {docToMigrate && (
          <MigrateDocumentModal
            doc={docToMigrate}
            projects={projects}
            folders={folders}
            onClose={() => setDocToMigrate(null)}
            onSubmit={async (projectId, folderId) => {
              await migrateDocument(docToMigrate.id, projectId, folderId);
              setDocToMigrate(null);
            }}
          />
        )}

        {renameTarget && (
          <RenameModal
            target={renameTarget}
            onClose={() => setRenameTarget(null)}
            onSubmit={async (newName) => {
              await renameItem(renameTarget, newName);
              setRenameTarget(null);
            }}
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
            onDragOver={canEditCurrentProject ? handleIntoDragOver('root') : undefined}
            onDragLeave={() =>
              setDropZone((s) => (s && s.kind === 'into' && s.id === 'root' ? null : s))
            }
            onDrop={canEditCurrentProject ? handleIntoDrop(null) : undefined}
            className={`inline-flex items-center hover:text-zinc-900 font-medium text-zinc-700 rounded px-1 ${
              dropZone?.kind === 'into' && dropZone.id === 'root'
                ? 'bg-indigo-100 ring-1 ring-indigo-400'
                : ''
            }`}
          >
            <Home className="w-3.5 h-3.5 mr-1" />
            {currentProject?.name || 'Project'}
          </button>
          {breadcrumb.map((f) => (
            <React.Fragment key={f.id}>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-300" />
              <button
                onClick={() => goToFolder(f.id)}
                onDragOver={canEditCurrentProject ? handleIntoDragOver(f.id) : undefined}
                onDragLeave={() =>
                  setDropZone((s) => (s && s.kind === 'into' && s.id === f.id ? null : s))
                }
                onDrop={canEditCurrentProject ? handleIntoDrop(f.id) : undefined}
                className={`hover:text-zinc-900 rounded px-1 ${
                  dropZone?.kind === 'into' && dropZone.id === f.id
                    ? 'bg-indigo-100 ring-1 ring-indigo-400'
                    : ''
                }`}
              >
                {f.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mt-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 truncate">
              {breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].name : currentProject?.name}
            </h1>
            {!breadcrumb.length && currentProject?.description && (
              <p className="text-sm text-zinc-500 mt-1">{currentProject.description}</p>
            )}
          </div>
          {canEditCurrentProject && (
            <div className="flex gap-2 flex-wrap sm:justify-end">
              <button
                onClick={() => setCreatingFolder(true)}
                className="inline-flex items-center px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700"
              >
                <FolderPlus className="w-4 h-4 mr-1.5 sm:mr-2" />
                <span className="hidden sm:inline">New </span>Folder
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
                className="inline-flex items-center px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700 disabled:opacity-50"
              >
                <Upload className="w-4 h-4 mr-1.5 sm:mr-2" />
                <span className="hidden sm:inline">Upload </span>Files
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
                className="inline-flex items-center px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg shadow-sm text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50"
              >
                <FolderUp className="w-4 h-4 mr-1.5 sm:mr-2" />
                <span className="hidden sm:inline">Upload </span>Folder
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
            {canEditCurrentProject ? 'Create a folder or upload documents to get started.' : 'Nothing here yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 overflow-hidden">
          <ul className="divide-y divide-zinc-200">
            {visibleFolders
              .slice()
              .sort((a, b) => {
                const ao = a.order ?? Number.MAX_SAFE_INTEGER;
                const bo = b.order ?? Number.MAX_SAFE_INTEGER;
                if (ao !== bo) return ao - bo;
                return naturalCompare(a.name, b.name);
              })
              .map((f) => {
                const zoneFor = dropZone && dropZone.id === f.id ? dropZone : null;
                const isIntoTarget = zoneFor?.kind === 'into';
                const showBefore = zoneFor?.kind === 'before';
                const showAfter = zoneFor?.kind === 'after';
                const isBeingDragged =
                  dragging?.type === 'folder' && dragging.id === f.id;
                return (
                  <li
                    key={f.id}
                    draggable={canEditCurrentProject}
                    onDragStart={canEditCurrentProject ? handleDragStart({ type: 'folder', id: f.id }) : undefined}
                    onDragEnd={handleDragEnd}
                    onDragOver={canEditCurrentProject ? handleRowDragOver(f.id, 'folder') : undefined}
                    onDragLeave={() => setDropZone((s) => (s && s.id === f.id ? null : s))}
                    onDrop={canEditCurrentProject ? handleRowDrop(f.id, 'folder') : undefined}
                    className={`relative transition-colors ${
                      isIntoTarget
                        ? 'bg-indigo-50 ring-2 ring-indigo-400 ring-inset'
                        : 'hover:bg-zinc-50'
                    } ${isBeingDragged ? 'opacity-40' : ''} ${
                      showBefore ? 'before:content-[""] before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-indigo-500 before:z-10' : ''
                    } ${
                      showAfter ? 'after:content-[""] after:absolute after:left-0 after:right-0 after:bottom-0 after:h-0.5 after:bg-indigo-500 after:z-10' : ''
                    }`}
                  >
                    <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
                      <div className="flex items-center min-w-0 gap-2 flex-1">
                        {canEditCurrentProject && (
                          <GripVertical className="w-4 h-4 text-zinc-300 flex-shrink-0 cursor-grab hidden sm:block" />
                        )}
                        <button
                          onClick={() => goToFolder(f.id)}
                          className="flex items-center min-w-0 gap-4 flex-1 text-left"
                        >
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 flex-shrink-0">
                            <Folder className="w-4 h-4 sm:w-5 sm:h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-zinc-900 truncate">{f.name}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              Folder &bull; Created {format(new Date(f.createdAt), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </button>
                      </div>
                      {canEditCurrentProject && (
                        <div className="flex items-center gap-1 sm:gap-2 ml-2 sm:ml-4 flex-shrink-0">
                          <button
                            onClick={() =>
                              setRenameTarget({
                                kind: 'folder',
                                id: f.id,
                                currentName: f.name,
                              })
                            }
                            className="p-1.5 sm:p-2 rounded-full text-zinc-700 bg-zinc-100 hover:bg-zinc-200"
                            title="Rename folder"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setFolderToDelete(f)}
                            className="p-1.5 sm:p-2 rounded-full text-red-700 bg-red-50 hover:bg-red-100"
                            title="Delete folder"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            {visibleDocuments
              .slice()
              .sort((a, b) => {
                const ao = a.order ?? Number.MAX_SAFE_INTEGER;
                const bo = b.order ?? Number.MAX_SAFE_INTEGER;
                if (ao !== bo) return ao - bo;
                return naturalCompare(a.title, b.title);
              })
              .map((d) => {
                const zoneFor = dropZone && dropZone.id === d.id ? dropZone : null;
                const showBefore = zoneFor?.kind === 'before';
                const showAfter = zoneFor?.kind === 'after';
                const isBeingDragged =
                  dragging?.type === 'document' && dragging.id === d.id;
                const isRestricted = d.visibility === 'restricted';
                return (
                <li
                  key={d.id}
                  draggable={canEditCurrentProject}
                  onDragStart={canEditCurrentProject ? handleDragStart({ type: 'document', id: d.id }) : undefined}
                  onDragEnd={handleDragEnd}
                  onDragOver={canEditCurrentProject ? handleRowDragOver(d.id, 'document') : undefined}
                  onDragLeave={() => setDropZone((s) => (s && s.id === d.id ? null : s))}
                  onDrop={canEditCurrentProject ? handleRowDrop(d.id, 'document') : undefined}
                  className={`relative transition-colors hover:bg-zinc-50 ${
                    isBeingDragged ? 'opacity-40' : ''
                  } ${
                    showBefore ? 'before:content-[""] before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-indigo-500 before:z-10' : ''
                  } ${
                    showAfter ? 'after:content-[""] after:absolute after:left-0 after:right-0 after:bottom-0 after:h-0.5 after:bg-indigo-500 after:z-10' : ''
                  }`}
                >
                  <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
                    <div className="flex items-center min-w-0 gap-2 flex-1">
                      {canEditCurrentProject && (
                        <GripVertical className="w-4 h-4 text-zinc-300 flex-shrink-0 cursor-grab hidden sm:block" />
                      )}
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 flex-shrink-0">
                        <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-zinc-900 truncate">{d.title}</p>
                          {isRestricted && (
                            <span className="inline-flex items-center text-[10px] font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5 flex-shrink-0">
                              <EyeOff className="w-3 h-3 mr-0.5" /> Private
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                          <span>{format(new Date(d.uploadedAt), 'MMM d, yyyy')}</span>
                          <span>&bull;</span>
                          <span>{formatBytes(d.size || 0)}</span>
                          {canEditCurrentProject && (
                            <>
                              <span>&bull;</span>
                              <span className="truncate">By {d.uploadedBy}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 ml-2 sm:ml-4 flex-shrink-0">
                      <Link
                        to={`/view/${d.id}`}
                        className="inline-flex items-center p-1.5 sm:p-2 rounded-full text-zinc-700 bg-zinc-100 hover:bg-zinc-200"
                        title="View Document"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      {canEditCurrentProject && (
                        <>
                          <button
                            onClick={() =>
                              setRenameTarget({
                                kind: 'document',
                                id: d.id,
                                currentName: d.title,
                              })
                            }
                            className="inline-flex items-center p-1.5 sm:p-2 rounded-full text-zinc-700 bg-zinc-100 hover:bg-zinc-200"
                            title="Rename document"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {canAdminCurrentProject && (
                            <button
                              onClick={() => setVisibilityTarget(d)}
                              className={`inline-flex items-center p-1.5 sm:p-2 rounded-full ${
                                isRestricted
                                  ? 'text-purple-700 bg-purple-50 hover:bg-purple-100'
                                  : 'text-zinc-700 bg-zinc-100 hover:bg-zinc-200'
                              }`}
                              title={
                                isRestricted
                                  ? 'Private — only selected members can see this'
                                  : 'Shared with project (click to restrict)'
                              }
                            >
                              {isRestricted ? <EyeOff className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                            </button>
                          )}
                          <button
                            onClick={() => toggleDownload(d.id, !!d.allowDownload)}
                            className={`inline-flex items-center p-1.5 sm:p-2 rounded-full ${
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
                            className="inline-flex items-center p-1.5 sm:p-2 rounded-full text-red-700 bg-red-50 hover:bg-red-100"
                            title="Delete Document"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
                );
              })}
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

      {renameTarget && (
        <RenameModal
          target={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSubmit={async (newName) => {
            await renameItem(renameTarget, newName);
            setRenameTarget(null);
          }}
        />
      )}

      {visibilityTarget && currentProject && (
        <VisibilityModal
          document={visibilityTarget}
          projectAllowedEmails={currentProject.allowedEmails || []}
          onClose={() => setVisibilityTarget(null)}
          onSubmit={async (visibility, emails) => {
            await updateVisibility(visibilityTarget.id, visibility, emails);
            setVisibilityTarget(null);
          }}
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

function MigrateDocumentModal({
  doc: document,
  projects,
  folders: preloadedFolders,
  onClose,
  onSubmit,
}: {
  doc: DocumentItem;
  projects: Project[];
  folders: FolderItem[];
  onClose: () => void;
  onSubmit: (projectId: string, folderId: string | null) => Promise<void>;
}) {
  const [projectId, setProjectId] = useState<string>(projects[0]?.id || '');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [targetFolders, setTargetFolders] = useState<FolderItem[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setTargetFolders([]);
      return;
    }
    const preload = preloadedFolders.filter((f) => f.projectId === projectId);
    if (preload.length > 0) {
      setTargetFolders(preload);
      return;
    }
    setLoadingFolders(true);
    getDocs(query(collection(db, 'folders'), where('projectId', '==', projectId)))
      .then((snap) => {
        setTargetFolders(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FolderItem[]
        );
      })
      .catch((err) => {
        console.error('Error loading folders for migration:', err);
      })
      .finally(() => setLoadingFolders(false));
  }, [projectId, preloadedFolders]);

  const folderOptions = useMemo(() => {
    const byId = new Map(targetFolders.map((f) => [f.id, f]));
    const depth = (id: string): number => {
      let n = 0;
      let cur = byId.get(id);
      while (cur && cur.parentFolderId) {
        n += 1;
        cur = byId.get(cur.parentFolderId);
      }
      return n;
    };
    return targetFolders
      .slice()
      .sort((a, b) => naturalCompare(a.name, b.name))
      .map((f) => ({ id: f.id, label: `${'— '.repeat(depth(f.id))}${f.name}` }));
  }, [targetFolders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setSubmitting(true);
    await onSubmit(projectId, folderId);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl"
      >
        <h3 className="text-lg font-semibold text-zinc-900 mb-1">Move to project</h3>
        <p className="text-sm text-zinc-500 mb-4 truncate">&quot;{document.title}&quot;</p>

        {projects.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            No projects exist yet. Create a project first.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Project</label>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setFolderId(null);
                }}
                className="block w-full rounded-lg border-zinc-300 focus:ring-zinc-500 focus:border-zinc-500 sm:text-sm px-3 py-2 border"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Folder (optional)
              </label>
              <select
                value={folderId ?? ''}
                onChange={(e) => setFolderId(e.target.value || null)}
                disabled={loadingFolders}
                className="block w-full rounded-lg border-zinc-300 focus:ring-zinc-500 focus:border-zinc-500 sm:text-sm px-3 py-2 border"
              >
                <option value="">(Project root)</option>
                {folderOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {loadingFolders && (
                <p className="text-xs text-zinc-400 mt-1">Loading folders...</p>
              )}
            </div>
          </div>
        )}

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
            disabled={submitting || !projectId || projects.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg disabled:opacity-50"
          >
            {submitting ? 'Moving...' : 'Move'}
          </button>
        </div>
      </form>
    </div>
  );
}

function RenameModal({
  target,
  onClose,
  onSubmit,
}: {
  target: { kind: 'project' | 'folder' | 'document'; id: string; currentName: string };
  onClose: () => void;
  onSubmit: (newName: string) => Promise<void>;
}) {
  const [name, setName] = useState(target.currentName);
  const [submitting, setSubmitting] = useState(false);
  const label =
    target.kind === 'project'
      ? 'Project name'
      : target.kind === 'folder'
      ? 'Folder name'
      : 'File name';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === target.currentName) {
      onClose();
      return;
    }
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
        <h3 className="text-lg font-semibold text-zinc-900 mb-4">Rename</h3>
        <label className="block text-xs font-medium text-zinc-700 mb-1">{label}</label>
        <input
          autoFocus
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          className="block w-full rounded-lg border-zinc-300 focus:ring-zinc-500 focus:border-zinc-500 sm:text-sm px-3 py-2 border"
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
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

function VisibilityModal({
  document: documentItem,
  projectAllowedEmails,
  onClose,
  onSubmit,
}: {
  document: DocumentItem;
  projectAllowedEmails: string[];
  onClose: () => void;
  onSubmit: (visibility: 'project' | 'restricted', emails: string[]) => Promise<void>;
}) {
  const initialVisibility: 'project' | 'restricted' = documentItem.visibility || 'project';
  const initialRestricted = new Set(
    (documentItem.allowedEmails && documentItem.allowedEmails.length > 0
      ? documentItem.allowedEmails
      : projectAllowedEmails
    ).filter((e) => projectAllowedEmails.includes(e))
  );

  const [visibility, setVisibility] = useState<'project' | 'restricted'>(initialVisibility);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(initialRestricted);
  const [submitting, setSubmitting] = useState(false);

  const toggleEmail = (email: string) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const finalEmails =
      visibility === 'project'
        ? projectAllowedEmails
        : Array.from(selectedEmails);
    await onSubmit(visibility, finalEmails);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl"
      >
        <h3 className="text-lg font-semibold text-zinc-900 mb-1">Document visibility</h3>
        <p className="text-sm text-zinc-500 mb-4 truncate">&quot;{documentItem.title}&quot;</p>

        <div className="space-y-2">
          <label className="flex items-start gap-3 p-3 rounded-lg border border-zinc-200 cursor-pointer hover:bg-zinc-50">
            <input
              type="radio"
              name="visibility"
              checked={visibility === 'project'}
              onChange={() => setVisibility('project')}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium text-zinc-900">All project members</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Anyone with access to this project can see this file.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 p-3 rounded-lg border border-zinc-200 cursor-pointer hover:bg-zinc-50">
            <input
              type="radio"
              name="visibility"
              checked={visibility === 'restricted'}
              onChange={() => setVisibility('restricted')}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium text-zinc-900">Restricted</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Only the project members you pick can see this file.
              </p>
            </div>
          </label>
        </div>

        {visibility === 'restricted' && (
          <div className="mt-4 border border-zinc-200 rounded-lg p-3 max-h-64 overflow-y-auto">
            {projectAllowedEmails.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No one has project access yet. Grant project access in Access Control first.
              </p>
            ) : (
              <ul className="space-y-1">
                {projectAllowedEmails.map((email) => (
                  <li key={email}>
                    <label className="flex items-center gap-2 text-sm text-zinc-800 py-1 cursor-pointer hover:bg-zinc-50 rounded px-1">
                      <input
                        type="checkbox"
                        checked={selectedEmails.has(email)}
                        onChange={() => toggleEmail(email)}
                      />
                      <span className="truncate">{email}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

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
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
