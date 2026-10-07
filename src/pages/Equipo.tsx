import { useState, type FormEvent } from 'react'
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore'
import { Plus } from 'lucide-react'
import { Cabecera, Campo, ErrorCarga, Modal, Vacio } from '../components/ui'
import { C, useLista } from '../lib/db'
import { ROLES, type Rol } from '../lib/types'
import { useGuardar, useUsuario } from '../sesion'

const QUE_PUEDE: Record<Rol, string> = {
  admin: 'Todo, más dar acceso y cargar las sombras.',
  manager: 'Carga y edita reservas, clientes, pagos y consultas. No borra.',
  lectura: 'Ve todo, no cambia nada.',
}

export function Equipo() {
  const yo = useUsuario()
  const staff = useLista(C.staff, 'staff')
  const [nuevo, setNuevo] = useState(false)
  const { guardar, error } = useGuardar()
  const filas = [...staff.datos].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'))

  return (
    <>
      <Cabecera titulo="Equipo" sub="Quién entra al admin. Se entra con la cuenta de Google del email que cargues acá.">
        <button type="button" className="btn" onClick={() => setNuevo(true)}><Plus size={17} />Dar acceso</button>
      </Cabecera>

      <div className="grilla g-3" style={{ marginBottom: 20 }}>
        {(Object.keys(ROLES) as Rol[]).map((r) => (
          <div className="tarjeta" key={r}>
            <h2>{ROLES[r]}</h2>
            <p className="secundario" style={{ marginTop: 4 }}>{QUE_PUEDE[r]}</p>
          </div>
        ))}
      </div>

      <ErrorCarga error={staff.error} />
      {error && <p className="aviso" style={{ marginBottom: 12 }}>{error}</p>}
      <div className="tabla-envoltorio">
        {filas.length === 0 ? <Vacio titulo="Cargando…" /> : (
          <table>
            <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Acceso</th><th /></tr></thead>
            <tbody>
              {filas.map((s) => {
                const soyYo = s.id === yo.email
                return (
                  <tr key={s.id}>
                    <td><b className={s.activo ? undefined : 'tachado'}>{s.nombre || '—'}</b>{soyYo && <span className="secundario"> (vos)</span>}</td>
                    <td>{s.id}</td>
                    <td>
                      <select className="input" style={{ width: 'auto', minHeight: 32, padding: '2px 8px' }} value={s.rol} disabled={soyYo}
                        aria-label={`Rol de ${s.id}`} title={soyYo ? 'No podés cambiarte el rol a vos mismo' : undefined}
                        onChange={(e) => guardar(() => updateDoc(doc(C.staff, s.id), { rol: e.target.value as Rol }), 'Rol actualizado.')}>
                        {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td>
                      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" checked={s.activo} disabled={soyYo}
                          onChange={(e) => guardar(() => updateDoc(doc(C.staff, s.id), { activo: e.target.checked }))} />
                        {s.activo ? 'Activo' : 'Sin acceso'}
                      </label>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {!soyYo && (
                        <button type="button" className="btn btn-peligro btn-chico" onClick={() => {
                          if (confirm(`¿Quitar a ${s.id} del equipo?`)) void guardar(() => deleteDoc(doc(C.staff, s.id)), 'Quitado del equipo.')
                        }}>Quitar</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {nuevo && <AccesoForm existentes={staff.datos.map((s) => s.id)} onCerrar={() => setNuevo(false)} />}
    </>
  )
}

function AccesoForm({ existentes, onCerrar }: { existentes: string[]; onCerrar: () => void }) {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<Rol>('manager')
  const { guardar, guardando, error, setError } = useGuardar()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const m = email.trim().toLowerCase()
    if (!/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(m)) return setError('Ese email no parece válido.')
    if (existentes.includes(m)) return setError('Ese email ya tiene acceso.')
    const ok = await guardar(() => setDoc(doc(C.staff, m), { nombre: nombre.trim(), rol, activo: true }), `${m} ya puede entrar.`)
    if (ok) onCerrar()
  }

  return (
    <Modal titulo="Dar acceso" onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        <div className="modal-cuerpo">
          <Campo label="Email de Google" ayuda="Gmail o cualquier cuenta de Google.">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Campo>
          <div className="fila-campos">
            <Campo label="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} /></Campo>
            <Campo label="Rol" ayuda={QUE_PUEDE[rol]}>
              <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
          </div>
          {error && <p className="aviso">{error}</p>}
        </div>
        <div className="modal-pie">
          <button type="button" className="btn btn-sec" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Dar acceso'}</button>
        </div>
      </form>
    </Modal>
  )
}
