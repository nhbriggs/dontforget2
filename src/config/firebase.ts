import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported, Analytics } from 'firebase/analytics';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC7A05NNsK4YaXEs3I4YFcGlfBqAoqJ-14",
  authDomain: "dontforget2.firebaseapp.com",
  projectId: "dontforget2",
  storageBucket: "dontforget2.firebasestorage.app",
  messagingSenderId: "769275303103",
  appId: "1:769275303103:web:582784a0cfe8ea669aa20a",
  measurementId: "G-4E0BQL1RZZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Analytics only if supported
let analytics: Analytics | null = null;
isSupported().then(yes => {
  if (yes) {
    analytics = getAnalytics(app);
  }
});

export { analytics }; 