import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA57yih9ROFRLRovV69h1PhACKLufAQxJc",
  authDomain: "strange-bird-467010-q9.firebaseapp.com",
  projectId: "strange-bird-467010-q9",
  storageBucket: "strange-bird-467010-q9.firebasestorage.app",
  messagingSenderId: "71375570323",
  appId: "1:71375570323:web:70e7bc23622ef9cfdf1466"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
