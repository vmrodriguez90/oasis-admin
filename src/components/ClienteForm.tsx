import { useState, type FormEvent } from 'react'
import { C, actualizar, crear, propagarCambio } from '../lib/db'
import type { Cliente, ConId } from '../lib/types'
import { useGuardar } from '../sesion'
import { Campo, Modal } from './ui'

type Datos = Pick<Cliente, 'nombre' | 'telefono' | 'email' | 'documento' | 'notas'>

export function ClienteForm({
  cliente, inicial, onCerrar, onCreado,
}: {
  cliente?: ConId<Cliente>
  inicial?: Partial<Datos>
  onCerrar: () => void
  onCreado?: (id: string) => void
}) {
  const [d, setD] = useState<Datos>({
    nombre: cliente?.nombre ?? inicial?.nombre ?? '',
    telefono: cliente?.telefono ?? inicial?.telefono ?? '',
    email: cliente?.email ?? inicial?.email ?? '',
    documento: cliente?.documento ?? inicial?.documento ?? '',
    notas: cliente?.notas ?? inicial?.notas ?? '',
  })
  const { guardar, guardando, error, setError } = useGuardar()
  const set = (k: keyof Datos) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value })

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const limpio = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim()])) as Datos
    if (!limpio.nombre) return setError('Falta el nombre.')
    let id = cliente?.id
    const ok = await guardar(async () => {
      if (cliente) {
        await actualizar(C.clientes, cliente.id, limpio)
        if (limpio.nombre !== cliente.nombre) await propagarCambio('clienteNombre', 'clienteId', cliente.id, limpio.nombre)
      } else {
        id = (await crear(C.clientes, limpio)).id
      }
    }, cliente ? 'Cliente actualizado.' : 'Cliente cargado.')
    if (ok) {
      if (!cliente && id) onCreado?.(id)
      onCerrar()
    }
  }

  return (
    <Modal titulo={cliente ? 'Editar cliente' : 'Nuevo cliente'} onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        <div className="modal-cuerpo">
          <Campo label="Nombre y apellido">
            <input value={d.nombre} onChange={set('nombre')} required maxLength={120} autoFocus />
          </Campo>
          <div className="fila-campos">
            <Campo label="Teléfono"><input value={d.telefono} onChange={set('telefono')} inputMode="tel" maxLength={40} /></Campo>
            <Campo label="Email"><input value={d.email} onChange={set('email')} type="email" maxLength={120} /></Campo>
            <Campo label="DNI"><input value={d.documento} onChange={set('documento')} maxLength={20} /></Campo>
          </div>
          <Campo label="Notas"><textarea value={d.notas} onChange={set('notas')} maxLength={2000} /></Campo>
          {error && <p className="aviso">{error}</p>}
        </div>
        <div className="modal-pie">
          <button type="button" className="btn btn-sec" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}
