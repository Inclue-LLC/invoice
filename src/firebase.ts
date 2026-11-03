import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
const useEmulator = env.VITE_USE_EMULATOR === 'true';

export const app = initializeApp(
  isFirebaseConfigured ? firebaseConfig : { apiKey: 'demo', projectId: 'demo-invoice', authDomain: 'localhost' },
);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  // 複数のタブ（一覧と印刷画面など）を同時に開いてもオフラインキャッシュを共有できるようにする
  localCache: useEmulator ? undefined : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

/** 空文字の場合はドメイン制限なし */
export const allowedDomain: string = (env.VITE_ALLOWED_DOMAIN ?? '').trim();
