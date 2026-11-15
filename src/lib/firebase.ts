import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA57yih9ROFRLRovV69h1PhACKLufAQxJc",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "strange-bird-467010-q9.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "strange-bird-467010-q9",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "strange-bird-467010-q9.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "71375570323",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:71375570323:web:70e7bc23622ef9cfdf1466"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
