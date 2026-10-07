import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth } from './firebase'
import { C, mensajeDeError } from './lib/db'
import { hoy, temporadaDe } from './lib/fechas'
import type { Rol } from './lib/types'

// ── Sesión ────────────────────────────────────────────────────────────

export type Sesion =
  | { estado: 'cargando' }
  | { estado: 'fuera' }
  | { estado: 'sin-acceso'; email: string }
  | { estado: 'dentro'; email: string; nombre: string; rol: Rol; foto: string | null }

const SesionCtx = createContext<Sesion>({ estado: 'cargando' })

export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion>({ estado: 'cargando' })

  useEffect(() => {
    let dejarStaff: (() => void) | undefined
    const dejarAuth = onAuthStateChanged(auth, (user) => {
      dejarStaff?.()
      dejarStaff = undefined
      if (!user?.email) {
        setSesion({ estado: 'fuera' })
        return
      }
      const email = user.email.toLowerCase()
      setSesion({ estado: 'cargando' })
      // En vivo: si un admin le cambia el rol o le quita el acceso, se aplica al instante.
      dejarStaff = onSnapshot(
        doc(C.staff, email),
        (snap) => {
          const s = snap.data()
          if (!s || !s.activo) setSesion({ estado: 'sin-acceso', email })
          else setSesion({ estado: 'dentro', email, nombre: s.nombre || user.displayName || email, rol: s.rol, foto: user.photoURL })
        },
        () => setSesion({ estado: 'sin-acceso', email }),
      )
    })
    return () => {
      dejarStaff?.()
      dejarAuth()
    }
  }, [])

  return <SesionCtx.Provider value={sesion}>{children}</SesionCtx.Provider>
}

export function useSesion() {
  return useContext(SesionCtx)
}

/** Para pantallas que sólo se muestran con sesión iniciada. */
export function useUsuario() {
  const s = useContext(SesionCtx)
  if (s.estado !== 'dentro') throw new Error('useUsuario fuera de una sesión iniciada')
  return s
}

export function salir() {
  return signOut(auth)
}

// ── Temporada ─────────────────────────────────────────────────────────

const TemporadaCtx = createContext<{ temporada: string; setTemporada: (t: string) => void }>({
  temporada: temporadaDe(hoy()),
  setTemporada: () => {},
})

export function TemporadaProvider({ children }: { children: ReactNode }) {
  const [temporada, setTemporada] = useState(() => temporadaDe(hoy()))
  const valor = useMemo(() => ({ temporada, setTemporada }), [temporada])
  return <TemporadaCtx.Provider value={valor}>{children}</TemporadaCtx.Provider>
}

export function useTemporada() {
  return useContext(TemporadaCtx)
}

// ── Avisos ────────────────────────────────────────────────────────────

interface Aviso { id: number; texto: string; error: boolean }

const AvisosCtx = createContext<(texto: string, error?: boolean) => void>(() => {})

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const n = useRef(0)
  const avisar = useCallback((texto: string, error = false) => {
    const id = ++n.current
    setAvisos((a) => [...a, { id, texto, error }])
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), error ? 8000 : 4000)
  }, [])
  return (
    <AvisosCtx.Provider value={avisar}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={a.error ? 'aviso-flotante error' : 'aviso-flotante'}>{a.texto}</div>
        ))}
      </div>
    </AvisosCtx.Provider>
  )
}

export function useAvisos() {
  return useContext(AvisosCtx)
}

/**
 * Corre una escritura y devuelve si salió bien. Firestore aplica la escritura
 * en el celular al instante pero la promesa recién se resuelve cuando el
 * servidor confirma: sin señal quedaría colgada. Si tarda, se avisa que se
 * sube sola cuando vuelva la conexión, y si después falla, también se avisa.
 */
export function useGuardar() {
  const avisar = useAvisos()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardar = useCallback(
    async (accion: () => Promise<unknown>, ok?: string): Promise<boolean> => {
      setGuardando(true)
      setError(null)
      const promesa = accion()
      const espera = new Promise<'tarde'>((r) => setTimeout(() => r('tarde'), 5000))
      try {
        const r = await Promise.race([promesa, espera])
        if (r === 'tarde') {
          avisar('Sin señal: queda guardado en este dispositivo y se sube cuando vuelva la conexión.')
          promesa.catch((e) => avisar(mensajeDeError(e), true))
        } else if (ok) {
          avisar(ok)
        }
        return true
      } catch (e) {
        setError(mensajeDeError(e))
        return false
      } finally {
        setGuardando(false)
      }
    },
    [avisar],
  )

  return { guardar, guardando, error, setError }
}
