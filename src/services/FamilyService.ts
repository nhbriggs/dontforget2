import { db } from '../config/firebase';
import { collection, doc, setDoc, getDoc, updateDoc, arrayUnion, query, where, getDocs } from 'firebase/firestore';
import { Family, JoinCode } from '../types/Family';
import { nanoid } from 'nanoid';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../config/firebase';

export class FamilyService {
  private static readonly CODE_LENGTH = 6;
  private static readonly CODE_EXPIRY_HOURS = 1;

  static async createFamily(name: string, adminId: string): Promise<Family> {
    const familyId = nanoid();
    const family: Family = {
      id: familyId,
      name,
      createdAt: new Date(),
      createdBy: adminId,
      adminIds: [adminId],
      childrenIds: [],
      joinCodes: []
    };

    await setDoc(doc(db, 'families', familyId), family);
    return family;
  }

  static async generateJoinCode(familyId: string, type: 'parent' | 'child'): Promise<string> {
    const familyRef = doc(db, 'families', familyId);
    const familyDoc = await getDoc(familyRef);
    
    if (!familyDoc.exists()) {
      throw new Error('Family not found');
    }

    const family = familyDoc.data() as Family;
    // Generate 8-character alphanumeric code in A9A9-A9A9 format
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    function randomChar() {
      return chars.charAt(Math.floor(Math.random() * chars.length));
    }
    let code = '';
    for (let i = 0; i < 4; i++) code += randomChar();
    code += '-';
    for (let i = 0; i < 4; i++) code += randomChar();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + FamilyService.CODE_EXPIRY_HOURS * 60 * 60 * 1000);

    const joinCode = {
      code,
      type,
      createdAt: now,
      expiresAt
    };

    await updateDoc(familyRef, {
      joinCodes: arrayUnion(joinCode)
    });

    return code;
  }

  static async joinFamily(code: string, familyName: string, userId: string): Promise<Family> {
    // Find the family with the matching code and name
    const familiesRef = collection(db, 'families');
    const q = query(
      familiesRef,
      where('name', '==', familyName)
    );
    
    const querySnapshot = await getDocs(q);
    let targetFamily: Family | null = null;
    let joinCode: JoinCode | null = null;

    for (const doc of querySnapshot.docs) {
      const family = doc.data() as Family;
      const validCode = family.joinCodes?.find(c => 
        c.code === code && 
        c.expiresAt > new Date() && 
        !c.usedBy
      );

      if (validCode) {
        targetFamily = family;
        joinCode = {
          ...validCode,
          familyId: family.id,
          familyName: family.name
        };
        break;
      }
    }

    if (!targetFamily || !joinCode) {
      throw new Error('Invalid or expired join code');
    }

    // Update the family document
    const familyRef = doc(db, 'families', targetFamily.id);
    const updates: any = {};

    if (joinCode.type === 'parent') {
      updates.adminIds = arrayUnion(userId);
    } else {
      updates.childrenIds = arrayUnion(userId);
    }

    // Mark the code as used
    const updatedJoinCodes = targetFamily.joinCodes?.map(c => 
      c.code === code ? { ...c, usedBy: userId } : c
    );
    updates.joinCodes = updatedJoinCodes;

    await updateDoc(familyRef, updates);

    return {
      ...targetFamily,
      ...updates
    };
  }

  static async getFamily(familyId: string): Promise<Family | null> {
    const familyDoc = await getDoc(doc(db, 'families', familyId));
    if (!familyDoc.exists()) {
      return null;
    }
    return familyDoc.data() as Family;
  }

  static async getUserFamilies(userId: string): Promise<Family[]> {
    const familiesRef = collection(db, 'families');
    const q = query(
      familiesRef,
      where('adminIds', 'array-contains', userId)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Family);
  }

  static async validateJoinCode(code: string, familyName: string): Promise<boolean> {
    // Find the family with the matching code and name
    const familiesRef = collection(db, 'families');
    const q = query(
      familiesRef,
      where('name', '==', familyName)
    );
    const querySnapshot = await getDocs(q);
    for (const docSnap of querySnapshot.docs) {
      const family = docSnap.data() as Family;
      const validCode = (family.joinCodes || []).find(c =>
        c.code === code &&
        (!c.usedBy) &&
        (typeof c.expiresAt === 'object' && 'seconds' in c.expiresAt
          ? new Date(c.expiresAt.seconds * 1000) > new Date()
          : new Date(c.expiresAt) > new Date())
      );
      if (validCode) return true;
    }
    return false;
  }

  static async registerWithFamilyInvite({ code, familyName, name, email, password }: {
    code: string;
    familyName: string;
    name: string;
    email: string;
    password: string;
  }): Promise<void> {
    console.log('[registerWithFamilyInvite] Step 0: Start', { code, familyName, name, email });
    // 1. Find the family and code
    const familiesRef = collection(db, 'families');
    const q = query(familiesRef, where('name', '==', familyName));
    const querySnapshot = await getDocs(q);
    let targetFamily: Family | null = null;
    let joinCode: any = null;
    for (const docSnap of querySnapshot.docs) {
      const family = docSnap.data() as Family;
      const validCode = (family.joinCodes || []).find(c =>
        c.code === code &&
        (!c.usedBy) &&
        (typeof c.expiresAt === 'object' && 'seconds' in c.expiresAt
          ? new Date((c.expiresAt as any).seconds * 1000) > new Date()
          : new Date(c.expiresAt) > new Date())
      );
      if (validCode) {
        targetFamily = family;
        joinCode = validCode;
        break;
      }
    }
    if (!targetFamily || !joinCode) {
      console.log('[registerWithFamilyInvite] Step 1: Invalid or expired invite code', { targetFamily, joinCode });
      throw new Error('Invalid or expired invite code.');
    }
    console.log('[registerWithFamilyInvite] Step 1: Found family and code', { targetFamily, joinCode });
    // 2. Create the user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log('[registerWithFamilyInvite] Step 2: Created user in Auth', { user });
    try {
      await updateProfile(user, { displayName: name });
      console.log('[registerWithFamilyInvite] Step 2b: Updated user profile displayName');
    } catch (err) {
      console.error('[registerWithFamilyInvite] Error updating user profile:', err);
      throw err;
    }
    // Debug log before updating family doc and writing user profile
    console.log('[registerWithFamilyInvite] DEBUG: About to update family doc and write user profile');
    try {
      // 3. Add user to family
      const familyRef = doc(db, 'families', targetFamily.id);
      const updates: any = {};
      // Defensive: ensure arrays exist
      if (!Array.isArray(targetFamily.parentIds)) targetFamily.parentIds = [];
      if (!Array.isArray(targetFamily.childrenIds)) targetFamily.childrenIds = [];
      if (joinCode.type === 'parent') {
        updates.parentIds = arrayUnion(user.uid);
      } else {
        updates.childrenIds = arrayUnion(user.uid);
      }
      // 4. Mark code as used
      const updatedJoinCodes = (targetFamily.joinCodes || []).map((c: any) =>
        c.code === code ? { ...c, usedBy: user.uid } : c
      );
      updates.joinCodes = updatedJoinCodes;
      await updateDoc(familyRef, updates);
      console.log('[registerWithFamilyInvite] Step 3: Updated family doc', { familyRef, updates });

      // 5. Create a user profile in 'users' collection
      const userData = {
        id: user.uid,
        displayName: name,
        email,
        familyId: targetFamily.id,
        role: joinCode.type === 'parent' ? 'parent' : 'child',
        createdAt: new Date(),
      };
      console.log('[registerWithFamilyInvite] USER: About to write user profile to Firestore', {
        uid: user.uid,
        user,
        userData,
      });
      await setDoc(doc(db, 'users', user.uid), userData);
      console.log('[registerWithFamilyInvite] USER: Successfully wrote user profile to Firestore for UID:', user.uid);
    } catch (err) {
      console.error('[registerWithFamilyInvite] ERROR after DEBUG log:', err);
    }
  }

  static async getUserByEmail(email: string): Promise<any | null> {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data();
    }
    return null;
  }
} 