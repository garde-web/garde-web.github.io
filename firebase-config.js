// Paste your own config: Firebase console → Project settings → Your apps → Web app
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDqQwTspDeEpf8nAXt3AP04v8Phn-e5kJQ",
  authDomain: "rentora-415ca.firebaseapp.com",
  projectId: "rentora-415ca",
  appId: "1:209170725014:web:7a8999d17d4e80e1f86ab7",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();
