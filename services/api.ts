import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import type { Business, Post, User, BusinessPostcard } from '../types';
import { supabase } from './supabase';
import type { TableInsert, TableUpdate } from './database.types';

export type BusinessCursor = number;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface DataAccessErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | undefined;
    providers: string[];
    role?: string;
  }
}

let currentAuthUser: SupabaseAuthUser | null = null;

function handleDataAccessError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: DataAccessErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAuthUser?.id,
      email: currentAuthUser?.email,
      providers: currentAuthUser?.app_metadata?.providers || [],
      role: typeof currentAuthUser?.user_metadata?.role === 'string' ? currentAuthUser.user_metadata.role : undefined
    },
    operationType,
    path
  };
  console.error('Data Access Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function ensureNoSupabaseError(error: { message: string } | null, operationType: OperationType, path: string) {
  if (error) {
    handleDataAccessError(new Error(error.message), operationType, path);
  }
}

function toDate(value: unknown, fallback?: Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) {
      return date;
    }
  }
  return fallback ?? new Date();
}

function withNormalizedVerification<T extends { isVerified?: boolean | null; verified?: boolean | null }>(row: T): T & { isVerified: boolean } {
  return {
    ...row,
    isVerified: row.isVerified ?? row.verified ?? false
  };
}

function mapBusiness(row: Record<string, unknown>): Business {
  return withNormalizedVerification({
    ...(row as unknown as Business),
    id: String(row.id)
  });
}

function mapPost(row: Record<string, unknown>): Post {
  const mapped = withNormalizedVerification({
    ...(row as unknown as Post),
    id: String(row.id)
  });

  return {
    ...mapped,
    createdAt: toDate((row as any).createdAt)
  };
}

function mapPostcard(row: Record<string, unknown>): BusinessPostcard {
  const mapped = withNormalizedVerification({
    ...(row as unknown as BusinessPostcard),
    id: String(row.id)
  });

  return {
    ...mapped,
    updatedAt: row.updatedAt ? toDate(row.updatedAt, undefined) : undefined
  };
}

function createPollingSubscription(callback: (posts: Post[]) => void, intervalMs = 15000) {
  let isCancelled = false;

  const run = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(50);

    ensureNoSupabaseError(error, OperationType.GET, 'posts');

    if (!isCancelled && data) {
      callback(data.map((item) => mapPost(item as unknown as Record<string, unknown>)));
    }
  };

  run().catch((error) => handleDataAccessError(error, OperationType.GET, 'posts'));
  const timer = window.setInterval(() => {
    run().catch((error) => handleDataAccessError(error, OperationType.GET, 'posts'));
  }, intervalMs);

  return () => {
    isCancelled = true;
    window.clearInterval(timer);
  };
}

export const api = {
  async getBusinesses(params: { category?: string; city?: string; governorate?: string; lastDoc?: BusinessCursor; limit?: number; featuredOnly?: boolean } = {}) {
    const path = 'businesses';
    try {
      const pageSize = params.limit || 20;
      const offset = params.lastDoc || 0;
      const trimmedCity = params.city?.trim();

      let query = supabase
        .from('businesses')
        .select('*')
        .range(offset, offset + pageSize - 1);

      if (trimmedCity) {
        query = query.ilike('city', `${trimmedCity}%`).order('city', { ascending: true }).order('name', { ascending: true });
      } else {
        query = query.order('name', { ascending: true });
      }

      if (params.category && params.category !== 'all') {
        query = query.eq('category', params.category);
      }

      if (params.governorate && params.governorate !== 'all') {
        query = query.eq('governorate', params.governorate);
      }

      if (params.featuredOnly) {
        query = query.eq('isFeatured', true);
      }

      const { data, error } = await query;
      ensureNoSupabaseError(error, OperationType.GET, path);

      const mapped = (data || []).map((row) => mapBusiness(row as unknown as Record<string, unknown>));
      const nextCursor = offset + mapped.length;

      return {
        data: mapped,
        lastDoc: mapped.length > 0 ? nextCursor : undefined,
        hasMore: mapped.length === pageSize
      };
    } catch (error) {
      return handleDataAccessError(error, OperationType.GET, path);
    }
  },

  subscribeToPosts(callback: (posts: Post[]) => void) {
    return createPollingSubscription(callback);
  },

  async getDeals() {
    const path = 'deals';
    try {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .order('createdAt', { ascending: false })
        .limit(10);

      ensureNoSupabaseError(error, OperationType.GET, path);
      return (data || []).map(row => ({ id: String(row.id), ...row } as any));
    } catch (error) {
      return handleDataAccessError(error, OperationType.GET, path);
    }
  },

  async getStories() {
    const path = 'stories';
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .order('createdAt', { ascending: false })
        .limit(20);

      ensureNoSupabaseError(error, OperationType.GET, path);
      return (data || []).map(row => ({ id: String(row.id), ...row } as any));
    } catch (error) {
      return handleDataAccessError(error, OperationType.GET, path);
    }
  },

  async getEvents(params: { category?: string; governorate?: string } = {}) {
    const path = 'events';
    try {
      let query = supabase
        .from('events')
        .select('*')
        .order('date', { ascending: true });

      if (params.category && params.category !== 'all') {
        query = query.eq('category', params.category);
      }

      if (params.governorate && params.governorate !== 'all') {
        query = query.eq('governorate', params.governorate);
      }

      const { data, error } = await query;
      ensureNoSupabaseError(error, OperationType.GET, path);

      return (data || []).map(row => ({
        ...row,
        id: String(row.id),
        date: toDate(row.date)
      }) as any);
    } catch (error) {
      return handleDataAccessError(error, OperationType.GET, path);
    }
  },

  async createPost(postData: Partial<Post>) {
    const path = 'posts';
    try {
      const payload: TableInsert<'posts'> = {
        ...postData,
        createdAt: new Date().toISOString(),
        likes: 0
      };

      const { data, error } = await supabase
        .from('posts')
        .insert(payload)
        .select('id')
        .single();

      ensureNoSupabaseError(error, OperationType.WRITE, path);
      return { success: true, id: String(data?.id) };
    } catch (error) {
      return handleDataAccessError(error, OperationType.WRITE, path);
    }
  },

  setAuthUser(user: SupabaseAuthUser | null) {
    currentAuthUser = user;
  },

  async getOrCreateProfile(authUser: SupabaseAuthUser, requestedRole: 'user' | 'owner' = 'user') {
    if (!authUser) return null;

    const path = `users/${authUser.id}`;
    try {
      const { data: existingUser, error: existingUserError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      ensureNoSupabaseError(existingUserError, OperationType.GET, path);

      const adminEmail = 'safaribosafar@gmail.com';
      const isAdminEmail = authUser.email === adminEmail && Boolean(authUser.email_confirmed_at);

      if (existingUser) {
        if (isAdminEmail && existingUser.role !== 'admin') {
          const { data: updated, error: updateError } = await supabase
            .from('users')
            .update({ role: 'admin' })
            .eq('id', authUser.id)
            .select('*')
            .single();

          ensureNoSupabaseError(updateError, OperationType.UPDATE, path);
          return updated as User;
        }
        return existingUser as User;
      }

      const newUser: User = {
        id: authUser.id,
        name: (typeof authUser.user_metadata?.full_name === 'string' && authUser.user_metadata.full_name) || (typeof authUser.user_metadata?.name === 'string' && authUser.user_metadata.name) || authUser.email?.split('@')[0] || 'User',
        email: authUser.email || '',
        avatar: (typeof authUser.user_metadata?.avatar_url === 'string' && authUser.user_metadata.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser.id}`,
        role: isAdminEmail ? 'admin' as const : requestedRole,
        businessId: requestedRole === 'owner' ? `b_${authUser.id}` : undefined
      };

      const payload: TableInsert<'users'> = {
        ...newUser,
        businessId: newUser.businessId ?? null
      };

      const { error: insertError } = await supabase.from('users').insert(payload);
      ensureNoSupabaseError(insertError, OperationType.CREATE, path);
      return newUser;
    } catch (error) {
      return handleDataAccessError(error, OperationType.WRITE, path);
    }
  },

  async upsertPostcard(postcard: BusinessPostcard) {
    const path = 'business_postcards';
    try {
      const docId = `${postcard.title}_${postcard.city}`.replace(/\s+/g, '_').toLowerCase();

      const payload: TableInsert<'business_postcards'> = {
        ...postcard,
        id: docId,
        updatedAt: new Date().toISOString()
      };

      const { error } = await supabase
        .from('business_postcards')
        .upsert(payload, { onConflict: 'id' });

      ensureNoSupabaseError(error, OperationType.WRITE, path);
      return { success: true, id: docId };
    } catch (error) {
      return handleDataAccessError(error, OperationType.WRITE, path);
    }
  },

  async getPostcards(governorate?: string) {
    const path = 'business_postcards';
    try {
      let query = supabase
        .from('business_postcards')
        .select('*')
        .order('updatedAt', { ascending: false });

      if (governorate && governorate !== 'all') {
        query = query.eq('governorate', governorate);
      }

      const { data, error } = await query;
      ensureNoSupabaseError(error, OperationType.GET, path);

      return (data || []).map((row) => mapPostcard(row as unknown as Record<string, unknown>));
    } catch (error) {
      return handleDataAccessError(error, OperationType.GET, path);
    }
  },

  async updateProfile(userId: string, data: Partial<User>) {
    const path = `users/${userId}`;
    try {
      const payload: TableUpdate<'users'> = {
        ...data,
        businessId: data.businessId ?? null,
        updatedAt: new Date().toISOString()
      };

      const { error } = await supabase
        .from('users')
        .update(payload)
        .eq('id', userId);

      ensureNoSupabaseError(error, OperationType.WRITE, path);
      return { success: true };
    } catch (error) {
      return handleDataAccessError(error, OperationType.WRITE, path);
    }
  }
};
