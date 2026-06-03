import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { 
  initializeFirestore, 
  Firestore
} from 'firebase/firestore';

export interface FirebaseInstance {
  app: any;
  auth: Auth;
  db: Firestore;
  googleProvider: GoogleAuthProvider;
}

// Dynamically initialize Firebase app from JSON configuration string
export function getFirebaseInstance(configJsonStr: string): FirebaseInstance | null {
  if (!configJsonStr) return null;
  try {
    const config = JSON.parse(configJsonStr);
    if (!config.apiKey || !config.projectId) {
      return null;
    }
    
    let app;
    if (getApps().length === 0) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }
    
    const auth = getAuth(app);
    const db = initializeFirestore(app, {
      ignoreUndefinedProperties: true
    });
    const googleProvider = new GoogleAuthProvider();
    
    return { app, auth, db, googleProvider };
  } catch (e) {
    console.error("Invalid Firebase Config:", e);
    return null;
  }
}

// Google Authentication popup handler
export async function signInWithGooglePopup(auth: Auth, provider: GoogleAuthProvider) {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
}

// Email/Password Signup handler
export async function signUpWithEmail(auth: Auth, email: string, password: string) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error("Error signing up with email:", error);
    throw error;
  }
}

// Email/Password Login handler
export async function logInWithEmail(auth: Auth, email: string, password: string) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error("Error logging in with email:", error);
    throw error;
  }
}

// Signout handler
export async function logOutUser(auth: Auth) {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error logging out:", error);
    throw error;
  }
}
