import { useState } from 'react'
import { GoogleAuthProvider, signInWithCredential, signInWithPopup } from 'firebase/auth'
import { auth } from '../firebase'
import { salir, type Sesion } from '../sesion'

const emuladores = import.meta.env.VITE_USE_EMULATORS === '1'

export function Login({ sesion }: { sesion: Sesion }) {
  const [error, setError] = useState<string | null>(null)
  const [emailEmu, setEmailEmu] = useState('admin@oasis.test')

  async function entrar() {
    setError(null)
    try {
      const proveedor = new GoogleAuthProvider()
      proveedor.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, proveedor)
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
      setError(code === 'auth/popup-blocked'
        ? 'El navegador bloqueó la ventana de Google. Permití ventanas emergentes para este sitio.'
        : 'No se pudo entrar. Probá de nuevo.')
    }
  }

  // Sólo con emuladores: entra con un Google de mentira, sin ventana.
  async function entrarEmu() {
    await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({
      sub: emailEmu, email: emailEmu, email_verified: true,
    })))
  }

  return (
    <div className="login">
      <div className="login-caja">
        <img src="/brand/imagotipo-horizontal-color.png" alt="OASIS Club de Mar" width={200} height={56} />
        <h1>Administración</h1>
        {sesion.estado === 'sin-acceso' ? (
          <>
            <p>
              <strong>{sesion.email}</strong> no tiene acceso al admin. Pedile a un administrador que te
              agregue en Equipo.
            </p>
            <button type="button" className="btn btn-sec" onClick={() => salir()}>Entrar con otra cuenta</button>
          </>
        ) : (
          <>
            <p>Entrá con la cuenta de Google que te dieron de alta.</p>
            <button type="button" className="btn" onClick={entrar}>Entrar con Google</button>
          </>
        )}
        {error && <p className="aviso">{error}</p>}
        {emuladores && sesion.estado !== 'sin-acceso' && (
          <form className="nota" style={{ display: 'grid', gap: 8, width: '100%' }} onSubmit={(e) => { e.preventDefault(); void entrarEmu() }}>
            <small>Emulador: entrar como</small>
            <input className="input" value={emailEmu} onChange={(e) => setEmailEmu(e.target.value)} aria-label="Email de prueba" />
            <button className="btn btn-sec btn-chico" type="submit">Entrar (emulador)</button>
          </form>
        )}
      </div>
    </div>
  )
}
