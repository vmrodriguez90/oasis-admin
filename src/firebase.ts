import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore'

const emuladores = import.meta.env.VITE_USE_EMULATORS === '1'

if (!emuladores && !import.meta.env.VITE_FIREBASE_PROJECT_ID) {
  throw new Error('Falta la configuración de Firebase: copiá .env.example a .env.local y completala (ver README).')
}

// Con emuladores alcanza un proyecto "demo-*": no necesita credenciales ni toca nada real.
const app = initializeApp(
  emuladores
    ? { apiKey: 'demo', authDomain: 'localhost', projectId: 'demo-oasis', appId: 'demo' }
    : {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      },
)

export const auth = getAuth(app)
auth.languageCode = 'es'

// Caché persistente: en la playa la señal va y viene. Lo cargado se sigue
// viendo sin conexión y lo que se escribe se sube cuando vuelve.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

if (emuladores) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
