import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getDatabase, ref, set, get, onValue, push, serverTimestamp, update, remove } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDRVpa7iITcykOBv585aPLG0_jK6dv18sU",
  authDomain: "meet999.firebaseapp.com",
  databaseURL: "https://meet999-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "meet999",
  storageBucket: "meet999.firebasestorage.app",
  messagingSenderId: "599144355",
  appId: "1:599144355:web:bfd296e379de67f23a8c16",
  measurementId: "G-J0P97M4Y37"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

export {
    app,
    auth,
    db,
    storage,
    googleProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    ref,
    set,
    get,
    onValue,
    push,
    serverTimestamp,
    update,
    remove,
    storageRef,
    uploadBytes,
    getDownloadURL
};
