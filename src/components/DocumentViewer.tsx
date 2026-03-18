import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, addDoc, collection } from 'firebase/firestore';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export default function DocumentViewer() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [documentData, setDocumentData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(true);
  
  const viewStartTime = useRef<number>(Date.now());

  useEffect(() => {
    const fetchDocument = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, 'documents', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setDocumentData({ id: docSnap.id, ...docSnap.data() });
          
          // Log view event
          if (profile) {
            try {
              await addDoc(collection(db, 'analytics'), {
                documentId: id,
                userId: profile.email,
                action: 'view',
                timestamp: new Date().toISOString()
              });
            } catch (analyticsError) {
              console.error('Failed to log analytics view:', analyticsError);
            }
          }
        } else {
          setError('Document not found or you do not have permission to view it.');
        }
      } catch (err) {
        console.error('Error fetching document:', err);
        setError('Error loading document.');
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();

    // Track view duration on unmount
    return () => {
      if (profile && id) {
        const duration = Math.floor((Date.now() - viewStartTime.current) / 1000);
        if (duration > 0) {
          addDoc(collection(db, 'analytics'), {
            documentId: id,
            userId: profile.email,
            action: 'view',
            durationSeconds: duration,
            timestamp: new Date().toISOString()
          }).catch(console.error);
        }
      }
    };
  }, [id, profile]);

  // Anti-screenshot measures
  useEffect(() => {
    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5'))) {
        // Obscure screen immediately
        setIsFocused(false);
        setTimeout(() => setIsFocused(true), 3000);
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !documentData) {
    return (
      <div className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center text-white p-4">
        <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-zinc-400 mb-6">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const isPdf = documentData.fileType === 'application/pdf';
  const isImage = documentData.fileType.startsWith('image/');

  return (
    <div className="min-h-screen bg-zinc-900 flex flex-col select-none">
      {/* Header */}
      <div className="bg-zinc-950 border-b border-zinc-800 p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-white font-medium truncate max-w-md">{documentData.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {(profile?.role === 'admin' || documentData.allowDownload) && (
            <button
              onClick={async () => {
                if (profile && id) {
                  try {
                    await addDoc(collection(db, 'analytics'), {
                      documentId: id,
                      userId: profile.email,
                      action: 'download',
                      timestamp: new Date().toISOString()
                    });
                  } catch (analyticsError) {
                    console.error('Failed to log analytics download:', analyticsError);
                  }
                }
                window.open(documentData.fileUrl, '_blank');
              }}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Download
            </button>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <span className="text-xs font-medium text-red-500 uppercase tracking-wider">Confidential</span>
          </div>
        </div>
      </div>

      {/* Viewer Area */}
      <div className="flex-1 relative overflow-auto flex justify-center p-8 bg-zinc-900">
        {!isFocused ? (
          <div className="absolute inset-0 z-50 bg-zinc-900/95 backdrop-blur-xl flex flex-col items-center justify-center text-white">
            <ShieldAlert className="w-16 h-16 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Content Protected</h2>
            <p className="text-zinc-400">Please return focus to the window to continue viewing.</p>
          </div>
        ) : (
          <div className="relative max-w-5xl w-full bg-white shadow-2xl rounded-sm overflow-hidden" style={{ minHeight: '800px' }}>
            {/* Watermark Overlay */}
            <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden opacity-10 flex flex-wrap items-center justify-center gap-12 p-12">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="transform -rotate-45 flex flex-col items-center justify-center">
                  <img 
                    src="https://olive-characteristic-crab-262.mypinata.cloud/ipfs/bafkreicpn2jxtbgciiq3bovhukqg6iixbckc632vgj6blvc2xo7ldfahzm" 
                    alt="Watermark"
                    className="w-48 h-auto mb-2"
                    referrerPolicy="no-referrer"
                  />
                  <div className="text-black font-bold text-xl whitespace-nowrap text-center">
                    {profile?.email} <br/> {new Date().toISOString().split('T')[0]}
                  </div>
                </div>
              ))}
            </div>

            {isPdf ? (
              <div className="flex flex-col items-center py-8">
                <Document
                  file={`/api/proxy-pdf?url=${encodeURIComponent(documentData.fileUrl)}`}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={(error) => console.error('Error while loading document!', error)}
                  loading={<Loader2 className="w-8 h-8 animate-spin text-zinc-400 my-12" />}
                  className="flex flex-col items-center gap-8"
                >
                  {Array.from(new Array(numPages || 0), (el, index) => (
                    <div key={`page_${index + 1}`} className="shadow-lg border border-zinc-200">
                      <Page 
                        pageNumber={index + 1} 
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        width={800}
                      />
                    </div>
                  ))}
                </Document>
              </div>
            ) : isImage ? (
              <img 
                src={documentData.fileUrl} 
                alt={documentData.title}
                className="w-full h-auto object-contain"
                onContextMenu={(e) => e.preventDefault()}
                draggable={false}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-24 text-zinc-500">
                <p>Preview not available for this file type.</p>
                {(profile?.role === 'admin' || documentData.allowDownload) && (
                  <a 
                    href={documentData.fileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="mt-4 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
                  >
                    Download File
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
