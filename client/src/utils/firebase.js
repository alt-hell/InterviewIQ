
import { initializeApp } from "firebase/app";
import {getAuth, GoogleAuthProvider} from "firebase/auth"
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_APIKEY,
  authDomain: "interviewiq-14708.firebaseapp.com",
  projectId: "interviewiq-14708",
  storageBucket: "interviewiq-14708.firebasestorage.app",
  messagingSenderId: "842132163948",
  appId: "1:842132163948:web:3d11ecfa28f65096653749",
  measurementId: "G-VQMFN81E4Q"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const provider = new GoogleAuthProvider()

export {auth , provider}