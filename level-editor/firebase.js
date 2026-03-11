import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup as fbSignIn, signOut as fbSignOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, collection as fbCol, doc as fbDoc, setDoc as fbSetDoc, getDocs as fbGetDocs, deleteDoc as fbDelDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// TODO: Replace this with your actual Firebase config! 
// Go to Firebase Console -> Project Settings -> General -> Web Apps
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

let app, auth, provider, db;
let signInWithPopup, signOut, collection, doc, setDoc, getDocs, deleteDoc;

try {
    if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        provider = new GoogleAuthProvider();
        db = getFirestore(app);

        signInWithPopup = fbSignIn;
        signOut = fbSignOut;
        collection = fbCol;
        doc = fbDoc;
        setDoc = fbSetDoc;
        getDocs = fbGetDocs;
        deleteDoc = fbDelDoc;
    } else {
        throw new Error("Firebase config missing");
    }
} catch (error) {
    console.warn("⚠️ Firebase is not configured! Cloud saving and authentication will be disabled.", error.message);

    auth = { onAuthStateChanged: (cb) => { cb(null); } };
    provider = null;
    db = null;

    signInWithPopup = async () => alert("Configure Firebase parameters in firebase.js first!");
    signOut = async () => { };
    collection = () => { };
    doc = () => { };
    setDoc = async () => { };
    getDocs = async () => [];
    deleteDoc = async () => { };
}

export { auth, provider, db, signInWithPopup, signOut, collection, doc, setDoc, getDocs, deleteDoc };
