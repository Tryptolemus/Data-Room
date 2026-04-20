import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import Login from './components/Login';
import Layout from './components/Layout';
import Documents from './components/Documents';
import AccessControl from './components/AccessControl';
import Analytics from './components/Analytics';
import Messages from './components/Messages';
import DocumentViewer from './components/DocumentViewer';
import { Loader2 } from 'lucide-react';

function PrivateRoute({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && profile.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, profile } = useAuth();

  return (
    <Routes>
      <Route 
        path="/login" 
        element={user && profile ? <Navigate to="/" replace /> : <Login />} 
      />
      
      <Route 
        path="/view/:id" 
        element={
          <PrivateRoute>
            <DocumentViewer />
          </PrivateRoute>
        } 
      />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout>
              <Documents />
            </Layout>
          </PrivateRoute>
        }
      />

      <Route
        path="/access"
        element={
          <PrivateRoute requireAdmin>
            <Layout>
              <AccessControl />
            </Layout>
          </PrivateRoute>
        }
      />

      <Route
        path="/analytics"
        element={
          <PrivateRoute>
            <Layout>
              <Analytics />
            </Layout>
          </PrivateRoute>
        }
      />

      <Route
        path="/messages"
        element={
          <PrivateRoute>
            <Layout>
              <Messages />
            </Layout>
          </PrivateRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
