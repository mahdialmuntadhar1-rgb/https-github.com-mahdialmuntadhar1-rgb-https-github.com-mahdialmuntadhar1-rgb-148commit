import { 
    collection, 
    getDocs, 
    query, 
    where, 
    limit, 
    startAfter, 
    orderBy, 
    addDoc, 
    serverTimestamp, 
    doc, 
    getDoc, 
    setDoc,
    getDocFromServer,
    Timestamp,
    onSnapshot,
    QueryDocumentSnapshot,
    DocumentData
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Business, Post, User, BusinessPostcard } from '../types';
import * as mockData from '../constants';
import firebaseConfig from '../firebase-applet-config.json';

const isConfigValid = firebaseConfig.projectId && !firebaseConfig.projectId.startsWith('remixed-');

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection
async function testConnection() {
  if (!isConfigValid) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

export const api = {
    async getBusinesses(params: { category?: string; city?: string; governorate?: string; lastDoc?: QueryDocumentSnapshot<DocumentData>; limit?: number; featuredOnly?: boolean } = {}) {
        if (!isConfigValid) {
            let filtered = [...mockData.businesses];
            if (params.featuredOnly) filtered = filtered.filter(b => b.isFeatured);
            if (params.category && params.category !== 'all') filtered = filtered.filter(b => b.category === params.category);
            if (params.governorate && params.governorate !== 'all') filtered = filtered.filter(b => b.governorate === params.governorate);
            return { data: filtered.slice(0, params.limit || 20), hasMore: false };
        }

        const path = 'businesses';
        try {
            // ... (rest of the existing getBusinesses logic)
            let q;
            const searchStr = params.city?.trim();
            
            if (searchStr) {
                q = query(collection(db, path), where('city', '>=', searchStr), where('city', '<=', searchStr + '\uf8ff'), orderBy('city'), orderBy('name'));
            } else {
                q = query(collection(db, path), orderBy('name'));
            }
            
            if (params.category && params.category !== 'all') {
                q = query(q, where('category', '==', params.category));
            }

            if (params.governorate && params.governorate !== 'all') {
                q = query(q, where('governorate', '==', params.governorate));
            }

            if (params.featuredOnly) {
                q = query(q, where('isFeatured', '==', true));
            }
            
            if (params.lastDoc) {
                q = query(q, startAfter(params.lastDoc));
            }

            const pageSize = params.limit || 20;
            q = query(q, limit(pageSize));
            
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => {
                const d = doc.data() as any;
                return { 
                    id: doc.id, 
                    ...d,
                    isVerified: d.isVerified ?? d.verified ?? false
                } as Business;
            });
            const lastVisible = snapshot.docs[snapshot.docs.length - 1];

            return {
                data,
                lastDoc: lastVisible,
                hasMore: data.length === pageSize
            };
        } catch (error) {
            handleFirestoreError(error, OperationType.GET, path);
            return { data: mockData.businesses.slice(0, params.limit || 20), hasMore: false };
        }
    },

    subscribeToPosts(callback: (posts: Post[]) => void) {
        if (!isConfigValid) {
            callback(mockData.posts || []);
            return () => {};
        }

        const path = 'posts';
        const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(50));
        
        return onSnapshot(q, (snapshot) => {
            const postsMap = new Map<string, Post>();
            
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const post = { 
                    id: doc.id, 
                    ...data,
                    createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : new Date(),
                    isVerified: data.isVerified ?? data.verified ?? false
                } as Post;
                postsMap.set(post.id, post);
            });
            
            callback(Array.from(postsMap.values()));
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, path);
            callback(mockData.posts || []);
        });
    },

    async getDeals() {
        if (!isConfigValid) return mockData.deals || [];
        const path = 'deals';
        try {
            const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(10));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        } catch (error) {
            handleFirestoreError(error, OperationType.GET, path);
            return mockData.deals || [];
        }
    },

    async getStories() {
        if (!isConfigValid) return mockData.stories || [];
        const path = 'stories';
        try {
            const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(20));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        } catch (error) {
            handleFirestoreError(error, OperationType.GET, path);
            return mockData.stories || [];
        }
    },

    async getEvents(params: { category?: string; governorate?: string } = {}) {
        if (!isConfigValid) {
            let filtered = [...mockData.events];
            if (params.category && params.category !== 'all') filtered = filtered.filter(e => e.category === params.category);
            if (params.governorate && params.governorate !== 'all') filtered = filtered.filter(e => e.governorate === params.governorate);
            return filtered;
        }

        const path = 'events';
        try {
            let q = query(collection(db, path), orderBy('date', 'asc'));
            if (params.category && params.category !== 'all') {
                q = query(q, where('category', '==', params.category));
            }
            if (params.governorate && params.governorate !== 'all') {
                q = query(q, where('governorate', '==', params.governorate));
            }
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    date: data.date ? (data.date as Timestamp).toDate() : new Date()
                } as any;
            });
        } catch (error) {
            handleFirestoreError(error, OperationType.GET, path);
            return mockData.events || [];
        }
    },

    async createPost(postData: Partial<Post>) {
        if (!isConfigValid) return { success: true, id: 'mock_post_id' };
        const path = 'posts';
        try {
            const docRef = await addDoc(collection(db, path), {
                ...postData,
                createdAt: serverTimestamp(),
                likes: 0
            });
            return { success: true, id: docRef.id };
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, path);
            return { success: false };
        }
    },

    async getOrCreateProfile(firebaseUser: any, requestedRole: 'user' | 'owner' = 'user') {
        if (!firebaseUser) return null;
        if (!isConfigValid) return { ...mockData.mockUser, id: firebaseUser.uid, email: firebaseUser.email || '' };
        
        const path = `users/${firebaseUser.uid}`;
        try {
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            
            const adminEmail = 'safaribosafar@gmail.com';
            const isAdminEmail = firebaseUser.email === adminEmail && firebaseUser.emailVerified;
            
            if (userDoc.exists()) {
                const userData = userDoc.data() as User;
                if (isAdminEmail && userData.role !== 'admin') {
                    const updatedUser = { ...userData, role: 'admin' as any };
                    await setDoc(doc(db, 'users', firebaseUser.uid), updatedUser, { merge: true });
                    return updatedUser;
                }
                return userData;
            } else {
                const newUser: User = {
                    id: firebaseUser.uid,
                    name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                    email: firebaseUser.email || '',
                    avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
                    role: isAdminEmail ? 'admin' as any : requestedRole,
                    businessId: requestedRole === 'owner' ? `b_${firebaseUser.uid}` : undefined
                };
                await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
                return newUser;
            }
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, path);
            return { ...mockData.mockUser, id: firebaseUser.uid, email: firebaseUser.email || '' };
        }
    },

    async upsertPostcard(postcard: BusinessPostcard) {
        if (!isConfigValid) return { success: true, id: 'mock_postcard_id' };
        const path = 'business_postcards';
        try {
            const docId = `${postcard.title}_${postcard.city}`.replace(/\s+/g, '_').toLowerCase();
            const docRef = doc(db, path, docId);
            
            await setDoc(docRef, {
                ...postcard,
                updatedAt: serverTimestamp()
            }, { merge: true });
            
            return { success: true, id: docId };
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, path);
            return { success: false };
        }
    },

    async getPostcards(governorate?: string) {
        if (!isConfigValid) return [];
        const path = 'business_postcards';
        try {
            let q = query(collection(db, path), orderBy('updatedAt', 'desc'));
            if (governorate && governorate !== 'all') {
                q = query(q, where('governorate', '==', governorate));
            }
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => {
                const data = doc.data();
                return { 
                    id: doc.id, 
                    ...data,
                    isVerified: data.isVerified ?? data.verified ?? false,
                    updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate() : undefined
                } as unknown as BusinessPostcard;
            });
        } catch (error) {
            handleFirestoreError(error, OperationType.GET, path);
            return [];
        }
    },

    async updateProfile(userId: string, data: Partial<User>) {
        if (!isConfigValid) return { success: true };
        const path = `users/${userId}`;
        try {
            await setDoc(doc(db, 'users', userId), {
                ...data,
                updatedAt: serverTimestamp()
            }, { merge: true });
            return { success: true };
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, path);
            return { success: false };
        }
    }
};
