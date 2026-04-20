import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import {
  onAuthStateChanged,
  User as FirebaseUser,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'viewer';
  name: string;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  info: string | null;
  login: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (email: string, password: string, name: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const docRef = doc(db, 'users', firebaseUser.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            // Check if they are the default admin
            const isAdmin = firebaseUser.email === 'gt.elysium@gmail.com' && firebaseUser.emailVerified;
            
            let role: 'admin' | 'viewer' = 'viewer';
            if (isAdmin) {
              role = 'admin';
            } else {
              // Check if they are an allowed email
              const allowedRef = doc(db, 'allowedEmails', firebaseUser.email || '');
              const allowedSnap = await getDoc(allowedRef);
              if (!allowedSnap.exists()) {
                // Clean up the just-created Firebase Auth account when unauthorized.
                try {
                  await firebaseUser.delete();
                } catch {
                  // Ignore; fall back to signOut.
                }
                await auth.signOut();
                setError('Your email is not authorized to access this data room. Ask an admin to authorize it first.');
                setLoading(false);
                return;
              }
            }

            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              role,
              name: firebaseUser.displayName || 'User',
            };
            await setDoc(docRef, newProfile);
            setProfile(newProfile);
          }
        } catch (err) {
          console.error('Error fetching user profile:', err);
          if (err instanceof Error && err.message.includes('permission')) {
             setError('Permission denied. You are not authorized.');
             await auth.signOut();
          } else {
             setError('An error occurred during authentication.');
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Login error:', err);
      if (err?.code === 'auth/unauthorized-domain') {
        setError(`Domain not authorized. Please add "${window.location.hostname}" to your Firebase Console -> Authentication -> Settings -> Authorized domains.`);
      } else {
        setError('Failed to login with Google. ' + (err?.message || ''));
      }
    }
  };

  const mapAuthError = (err: any): string => {
    const code = err?.code || '';
    switch (code) {
      case 'auth/invalid-email':
        return 'That email address looks invalid.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Email or password is incorrect.';
      case 'auth/email-already-in-use':
        return 'An account already exists for this email. Try signing in instead.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a minute and try again.';
      case 'auth/operation-not-allowed':
        return 'Email/password sign-in isn\'t enabled yet. Ask the admin to enable it in Firebase Console.';
      case 'auth/unauthorized-domain':
        return `Domain not authorized in Firebase Console. Add "${window.location.hostname}" under Authentication > Settings > Authorized domains.`;
      default:
        return err?.message || 'Authentication failed.';
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    setInfo(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      console.error('Email login error:', err);
      setError(mapAuthError(err));
    }
  };

  const signupWithEmail = async (email: string, password: string, name: string) => {
    setInfo(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (name.trim()) {
        try {
          await updateProfile(cred.user, { displayName: name.trim() });
        } catch (profileErr) {
          console.warn('Could not set displayName:', profileErr);
        }
      }
      // onAuthStateChanged will validate allowedEmails and delete the user if unauthorized.
    } catch (err: any) {
      console.error('Signup error:', err);
      setError(mapAuthError(err));
    }
  };

  const sendPasswordReset = async (email: string) => {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo(`Password reset email sent to ${email.trim()} if an account exists.`);
    } catch (err: any) {
      console.error('Reset error:', err);
      setError(mapAuthError(err));
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const clearError = () => {
    setError(null);
    setInfo(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        error,
        info,
        login,
        loginWithEmail,
        signupWithEmail,
        sendPasswordReset,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export function useCanViewAnalytics(): boolean | null {
  const { profile } = useAuth();
  const [canView, setCanView] = useState<boolean | null>(null);
  useEffect(() => {
    if (!profile) {
      setCanView(null);
      return;
    }
    if (profile.role === 'admin') {
      setCanView(true);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, 'allowedEmails', profile.email))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.exists() ? (snap.data() as any) : null;
        setCanView(!!data?.canViewAnalytics);
      })
      .catch(() => {
        if (!cancelled) setCanView(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);
  return canView;
}
