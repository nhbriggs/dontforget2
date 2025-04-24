require('dotenv').config();
const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function createUser(email: string, password: string, displayName: string, role: 'parent' | 'child') {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    
    // Create user document
    await setDoc(doc(db, 'users', uid), {
      email,
      displayName,
      role,
      createdAt: new Date(),
    });
    
    return uid;
  } catch (error) {
    console.error(`Error creating user ${email}:`, error);
    throw error;
  }
}

async function setupTestData() {
  try {
    // Create parent users
    const nickId = await createUser('nick@example.com', 'password123', 'Nick', 'parent');
    const staceyId = await createUser('stacey@example.com', 'password123', 'Stacey', 'parent');
    
    // Create child users
    const lilyId = await createUser('lily@example.com', 'password123', 'Lily', 'child');
    const harryId = await createUser('harry@example.com', 'password123', 'Harry', 'child');
    
    // Create Bruggs family
    const familyId = 'bruggs-family';
    await setDoc(doc(db, 'families', familyId), {
      name: 'Bruggs',
      parentIds: [nickId, staceyId],
      childrenIds: [lilyId, harryId],
      createdAt: new Date()
    });
    
    // Update users with familyId
    const users = [nickId, staceyId, lilyId, harryId];
    for (const userId of users) {
      await setDoc(doc(db, 'users', userId), { familyId }, { merge: true });
    }
    
    console.log('Test data setup completed successfully!');
    console.log('Family ID:', familyId);
    console.log('User IDs:', {
      Nick: nickId,
      Stacey: staceyId,
      Lily: lilyId,
      Harry: harryId
    });
    
  } catch (error) {
    console.error('Error setting up test data:', error);
  } finally {
    process.exit();
  }
}

// Run the setup
setupTestData(); 