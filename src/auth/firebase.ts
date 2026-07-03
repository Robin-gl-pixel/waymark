import { initializeApp } from 'firebase/app';
// getReactNativePersistence exists at runtime in firebase/auth but is missing
// from the published types (firebase-js-sdk#7615). Ignore the resolution
// error — the symbol is real and works.
// @ts-expect-error — see comment above
import { initializeAuth, getReactNativePersistence, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

if (!firebaseConfig.apiKey) {
  console.warn(
    '[firebase] EXPO_PUBLIC_FIREBASE_* env vars manquantes — Auth va échouer. ' +
    'Copie .env.example vers .env et remplis les valeurs (Firebase Console → Project settings).'
  );
}

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const db = getFirestore(app);
export const storage = getStorage(app);

// Local dev only: point Auth / Firestore / Storage at the Firebase Emulator
// Suite when `EXPO_PUBLIC_USE_EMULATOR=1` is set (see `npm run dev:emulator`).
// Without the env var, the app talks to prod as before — zero impact on
// non-dev builds or teammates who haven't opted in.
if (__DEV__ && process.env.EXPO_PUBLIC_USE_EMULATOR === '1') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
  // eslint-disable-next-line no-console
  console.info('[firebase] connected to LOCAL emulators (auth:9099, firestore:8080, storage:9199)');
}
