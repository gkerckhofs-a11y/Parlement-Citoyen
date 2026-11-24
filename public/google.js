import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
const response = await fetch("/__/firebase/init.json");
if (!response.ok) throw Error("La configuration Firebase est indisponible.");
const config = await response.json();
const auth = getAuth(initializeApp(config));
await setPersistence(auth, browserSessionPersistence);
await auth.authStateReady();
export async function connect() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(auth, provider);
}
export const signedIn = () => !!auth.currentUser;
export async function bearer() {
  if (!auth.currentUser) throw Error("Connectez-vous avec Google.");
  return auth.currentUser.getIdToken();
}
export const logout = () => signOut(auth);
