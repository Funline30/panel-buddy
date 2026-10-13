// ============================================================================
//  PANEL BUDDY - FIREBASE SETTINGS  (the only file you need to edit)
// ----------------------------------------------------------------------------
//  1. Firebase console -> your project -> Project settings (gear) -> "Your apps"
//     -> Web app (</>) -> "SDK setup and configuration" -> Config.
//  2. Copy each value from that firebaseConfig block into the quotes below.
//
//  These web config values are NOT secrets (Firebase puts them in every web
//  app). Your data is protected by the Firestore security rules in
//  firestore.rules, not by hiding these.
//
//  Alternative: leave this file alone and set Vercel environment variables
//  VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
//  VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID,
//  VITE_FIREBASE_APP_ID - then redeploy.
//
//  While apiKey still says PASTE_..., the app runs in DEMO MODE: everything is
//  saved only in this browser (localStorage), with a sample home preloaded.
// ============================================================================

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'PASTE_API_KEY_HERE',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'PASTE_PROJECT_ID',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'PASTE_PROJECT_ID.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'PASTE_SENDER_ID',
  appId: env.VITE_FIREBASE_APP_ID || 'PASTE_APP_ID',
};

export function isFirebaseConfigured() {
  const k = firebaseConfig.apiKey || '';
  return k.length > 10 && !k.startsWith('PASTE') && !String(firebaseConfig.projectId).startsWith('PASTE');
}
