import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { api } from '../services/api';

type AuthRole = 'user' | 'owner';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string, role?: AuthRole) => Promise<void>;
  signInWithGoogle: (role?: AuthRole) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Failed to read initial Supabase session:', error);
      }

      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      api.setAuthUser(data.session?.user ?? null);
      setLoading(false);
    };

    bootstrap().catch((error) => {
      console.error('Auth bootstrap error:', error);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      api.setAuthUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signUpWithPassword(email, password, role = 'user') {
        sessionStorage.setItem('pending_role', role);
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role
            }
          }
        });
        if (error) {
          sessionStorage.removeItem('pending_role');
          throw error;
        }
      },
      async signInWithGoogle(role = 'user') {
        sessionStorage.setItem('pending_role', role);
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin
          }
        });
        if (error) {
          sessionStorage.removeItem('pending_role');
          throw error;
        }
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
    }),
    [loading, session, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
