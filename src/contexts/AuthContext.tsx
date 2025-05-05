import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, role: 'parent' | 'child', displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('Setting up auth state listener');
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('Auth state changed:', firebaseUser ? 'User logged in' : 'No user');
      if (firebaseUser) {
        try {
          // Helper to poll for user doc
          const pollUserDoc = async (retries = 5, delay = 500): Promise<any | null> => {
            for (let i = 0; i < retries; i++) {
              const userDocRef = doc(db, 'users', firebaseUser.uid);
              const userDoc = await getDoc(userDocRef);
              const userData = userDoc.data();
              if (userData) return userData;
              console.log(`User doc not found, retrying (${i + 1}/${retries})...`);
              await new Promise(res => setTimeout(res, delay));
            }
            return null;
          };

          // Get additional user data from Firestore (with polling)
          console.log('Fetching user doc for UID:', firebaseUser.uid);
          const userData = await pollUserDoc();
          console.log('User data from Firestore (with polling):', userData);
          if (userData) {
            const newUser = {
              id: firebaseUser.uid,
              email: firebaseUser.email!,
              displayName: userData.displayName || '',
              role: userData.role,
              familyId: userData.familyId,
            };
            setUser(newUser);
          } else {
            console.error('User data not found in Firestore after polling.');
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const updateUser = async (updates: Partial<User>) => {
    if (!user?.id) return;
    
    console.log('Updating user with:', updates);
    try {
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, updates);
      
      // Update local state
      setUser(prevUser => {
        if (!prevUser) return null;
        return { ...prevUser, ...updates };
      });
      
      console.log('User updated successfully');
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  };

  const signIn = async (email: string, password: string) => {
    console.log('Attempting sign in for:', email);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      console.log('Sign in successful:', result.user.uid);
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, role: 'parent' | 'child', displayName: string) => {
    console.log('Attempting sign up for:', email);
    try {
      const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);
      console.log('Sign up successful:', firebaseUser.uid);
      
      // Create user document in Firestore
      const userData = {
        id: firebaseUser.uid,
        email,
        role,
        displayName,
        createdAt: new Date(),
      };
      
      await setDoc(doc(db, 'users', firebaseUser.uid), userData);
      console.log('User document created in Firestore');

      // If this is a parent signing up, create or update the family document
      if (role === 'parent') {
        const familyRef = doc(db, 'families', 'bruggs-family');
        const familyDoc = await getDoc(familyRef);
        
        if (!familyDoc.exists()) {
          await setDoc(familyRef, {
            id: 'bruggs-family',
            name: 'Bruggs Family',
            parentIds: { [firebaseUser.uid]: true },
            childrenIds: [],
            createdAt: new Date()
          });
          console.log('Created new family document');
        } else {
          const familyData = familyDoc.data();
          if (!familyData.parentIds) {
            familyData.parentIds = {};
          }
          familyData.parentIds[firebaseUser.uid] = true;
          await updateDoc(familyRef, { parentIds: familyData.parentIds });
          console.log('Updated existing family document');
        }
        
        // Update user with familyId
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          familyId: 'bruggs-family'
        });
      }
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    console.log('Attempting sign out');
    try {
      await firebaseSignOut(auth);
      console.log('Sign out successful');
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 