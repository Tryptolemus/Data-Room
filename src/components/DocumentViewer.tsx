import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, addDoc, collection } from 'firebase/firestore';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up PDF.js worker using CDN
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function DocumentViewer() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [documentData, setDocumentData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(true);
  const [pdfError, setPdfError] = useState<Error | null>(null);
  const [pageWidth, setPageWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 800;
    // Fit within the viewport minus small horizontal padding, capped at 800px.
    return Math.min(800, Math.max(280, window.innerWidth - 24));
  });

  const viewStartTime = useRef<number>(Date.now());

  const viewingProjectIdRef = useRef<string | null>(null);

  // Keep PDF page width in sync with viewport width so mobile fits.
  useEffect(() => {
    const onResize = () => {
      setPageWidth(Math.min(800, Math.max(280, window.innerWidth - 24)));
    };
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isMobile = pageWidth < 640;

  useEffect(() => {
    const fetchDocument = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, 'documents', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          setDocumentData({ id: docSnap.id, ...data });
          viewingProjectIdRef.current = typeof data?.projectId === 'string' ? data.projectId : null;

          // Log view event
          if (profile) {
            try {
              const entry: any = {
                documentId: id,
                userId: profile.email,
                action: 'view',
                timestamp: new Date().toISOString(),
              };
              if (viewingProjectIdRef.current) entry.projectId = viewingProjectIdRef.current;
              await addDoc(collection(db, 'analytics'), entry);
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
          const entry: any = {
            documentId: id,
            userId: profile.email,
            action: 'view',
            durationSeconds: duration,
            timestamp: new Date().toISOString(),
          };
          if (viewingProjectIdRef.current) entry.projectId = viewingProjectIdRef.current;
          addDoc(collection(db, 'analytics'), entry).catch(console.error);
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
      <div className="bg-zinc-950 border-b border-zinc-800 px-3 sm:px-4 py-3 flex items-center justify-between gap-2 sticky top-0 z-50">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <button
            onClick={() => navigate('/')}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors flex-shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-white text-sm sm:text-base font-medium truncate">{documentData.title}</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
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
              className="px-2.5 sm:px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors"
            >
              Download
            </button>
          )}
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full">
            <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="hidden sm:inline text-xs font-medium text-red-500 uppercase tracking-wider">Confidential</span>
          </div>
        </div>
      </div>

      {/* Viewer Area */}
      <div className="flex-1 relative overflow-auto flex justify-center p-2 sm:p-8 bg-zinc-900">
        {!isFocused ? (
          <div className="absolute inset-0 z-50 bg-zinc-900/95 backdrop-blur-xl flex flex-col items-center justify-center text-white p-6 text-center">
            <ShieldAlert className="w-16 h-16 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Content Protected</h2>
            <p className="text-zinc-400">Please return focus to the window to continue viewing.</p>
          </div>
        ) : (
          <div
            className="relative max-w-5xl w-full bg-white shadow-2xl rounded-sm overflow-hidden"
            style={{ minHeight: isMobile ? '400px' : '800px' }}
          >
            {/* Watermark Overlay */}
            <div
              className={`absolute inset-0 z-40 pointer-events-none overflow-hidden opacity-10 flex flex-wrap items-center justify-center ${
                isMobile ? 'gap-6 p-4' : 'gap-12 p-12'
              }`}
            >
              {Array.from({ length: isMobile ? 8 : 20 }).map((_, i) => (
                <div key={i} className="transform -rotate-45 flex flex-col items-center justify-center">
                  <img
                    src="https://olive-characteristic-crab-262.mypinata.cloud/ipfs/bafkreicpn2jxtbgciiq3bovhukqg6iixbckc632vgj6blvc2xo7ldfahzm"
                    alt="Watermark"
                    className={isMobile ? 'w-24 h-auto mb-1' : 'w-48 h-auto mb-2'}
                    referrerPolicy="no-referrer"
                  />
                  <div className={`text-black font-bold whitespace-nowrap text-center ${isMobile ? 'text-xs' : 'text-xl'}`}>
                    {profile?.email} <br/> {new Date().toISOString().split('T')[0]}
                  </div>
                </div>
              ))}
            </div>

            {isPdf ? (
              <div className="flex flex-col items-center py-4 sm:py-8">
                {(() => {
                  const viewerSrc = `/api/proxy-pdf?url=${encodeURIComponent(documentData.fileUrl)}`;
                  return (
                    <Document
                      file={viewerSrc}
                      onLoadSuccess={onDocumentLoadSuccess}
                      onLoadError={(error) => {
                        console.error('Error while loading document!', error);
                        setPdfError(error);
                      }}
                      loading={<Loader2 className="w-8 h-8 animate-spin text-zinc-400 my-12" />}
                      error={
                        <div className="flex flex-col items-center justify-center p-6 sm:p-12 text-center">
                          <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
                          <p className="text-zinc-900 font-medium">Failed to load PDF</p>
                          <p className="text-zinc-500 text-sm mt-2">{pdfError?.message || 'The document could not be rendered.'}</p>
                        </div>
                      }
                      className="flex flex-col items-center gap-4 sm:gap-8"
                    >
                      {Array.from(new Array(numPages || 0), (_el, index) => (
                        <div key={`page_${index + 1}`} className="shadow-lg border border-zinc-200 max-w-full">
                          <Page
                            pageNumber={index + 1}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            width={pageWidth}
                          />
                        </div>
                      ))}
                    </Document>
                  );
                })()}
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
              <div className="flex flex-col items-center justify-center h-full py-12 sm:py-24 text-zinc-500 px-4 text-center">
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
