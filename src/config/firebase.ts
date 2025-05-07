import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/analytics';

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
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Initialize Auth
export const auth = firebase.auth();

// Initialize Firestore
export const db = firebase.firestore();

// Initialize Analytics
let analytics = null;
if (firebase.analytics.isSupported()) {
  analytics = firebase.analytics();
}

export { analytics }; 