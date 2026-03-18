import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../firebase';
import { collection, query, onSnapshot, addDoc, deleteDoc, updateDoc, doc, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { FileText, Upload, Trash2, Eye, Download, File as FileIcon, Loader2, AlertTriangle, Lock, Unlock } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function Documents() {
  const { profile } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [documentToDelete, setDocumentToDelete] = useState<{id: string, fileUrl: string} | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    const q = query(collection(db, 'documents'), orderBy('uploadedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDocuments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error('Error fetching documents:', error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !profile) return;

    setUploading(true);
    setUploadError(null);
    
    const uploadPromises = Array.from(files).map(async (file) => {
      try {
        const storageRef = ref(storage, `documents/${Date.now()}_${file.name}`);
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
          allowDownload: false
        });
      } catch (error: any) {
        console.error(`Error uploading document ${file.name}:`, error);
        throw error;
      }
    });

    try {
      await Promise.all(uploadPromises);
    } catch (error: any) {
      if (error?.code === 'storage/retry-limit-exceeded' || error?.code === 'storage/unauthorized' || error?.message?.includes('retry time')) {
        setUploadError('Upload failed. Firebase Storage might not be enabled or configured correctly. To fix this: 1. Go to your Firebase Console. 2. Click "Storage" in the left menu. 3. Click "Get Started" to enable it. 4. Update the Storage Rules to allow authenticated reads/writes.');
      } else {
        setUploadError('Failed to upload one or more documents: ' + (error?.message || 'Unknown error'));
      }
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const confirmDelete = async () => {
    if (!documentToDelete) return;
    try {
      await deleteDoc(doc(db, 'documents', documentToDelete.id));
      if (documentToDelete.fileUrl.includes('firebasestorage')) {
        const fileRef = ref(storage, documentToDelete.fileUrl);
        await deleteObject(fileRef);
      }
    } catch (error) {
      console.error('Error deleting document:', error);
    } finally {
      setDocumentToDelete(null);
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

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Data Room Documents</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {isAdmin ? 'Manage and organize corporate documentation.' : 'Securely view corporate documentation.'}
          </p>
        </div>
        
        {isAdmin && (
          <div>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              multiple
              onChange={handleFileUpload}
              disabled={uploading}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
            />
            <label
              htmlFor="file-upload"
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-zinc-900 hover:bg-zinc-800 cursor-pointer disabled:opacity-50 transition-colors"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {uploading ? 'Uploading...' : 'Upload Document'}
            </label>
          </div>
        )}
      </div>

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

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-zinc-200 border-dashed">
          <FileIcon className="mx-auto h-12 w-12 text-zinc-300" />
          <h3 className="mt-2 text-sm font-medium text-zinc-900">No documents</h3>
          <p className="mt-1 text-sm text-zinc-500">
            {isAdmin ? 'Get started by uploading a new document.' : 'No documents have been shared yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 overflow-hidden">
          <ul className="divide-y divide-zinc-200">
            {documents.map((doc) => (
              <li key={doc.id} className="hover:bg-zinc-50 transition-colors">
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center min-w-0 gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <FileText className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900 truncate">
                        {doc.title}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                        <span>{format(new Date(doc.uploadedAt), 'MMM d, yyyy')}</span>
                        <span>&bull;</span>
                        <span>{formatBytes(doc.size || 0)}</span>
                        {isAdmin && (
                          <>
                            <span>&bull;</span>
                            <span className="truncate">By {doc.uploadedBy}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                    <Link
                      to={`/view/${doc.id}`}
                      className="inline-flex items-center p-2 border border-transparent rounded-full shadow-sm text-zinc-700 bg-zinc-100 hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-500 transition-colors"
                      title="View Document"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => toggleDownload(doc.id, !!doc.allowDownload)}
                          className={`inline-flex items-center p-2 border border-transparent rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
                            doc.allowDownload 
                              ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 focus:ring-emerald-500' 
                              : 'text-amber-700 bg-amber-50 hover:bg-amber-100 focus:ring-amber-500'
                          }`}
                          title={doc.allowDownload ? "Downloads Allowed (Click to Restrict)" : "Downloads Restricted (Click to Allow)"}
                        >
                          {doc.allowDownload ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setDocumentToDelete({id: doc.id, fileUrl: doc.fileUrl})}
                          className="inline-flex items-center p-2 border border-transparent rounded-full shadow-sm text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
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

      {/* Delete Confirmation Modal */}
      {documentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-semibold text-zinc-900">Delete Document</h3>
            </div>
            <p className="text-sm text-zinc-600 mb-6">
              Are you sure you want to delete this document? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDocumentToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
