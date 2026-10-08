import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { doc } from 'firebase/firestore'
import { MessageCircle, Trash2 } from 'lucide-react'
import { C, actualizar, borrar, crear, q, useDoc, useLista } from '../lib/db'
import { leerPesos, pesos } from '../lib/dinero'
import { diasIncluidos, fechaCorta, hoy, plural, rango } from '../lib/fechas'
import { esAdmin, puedeEditar } from '../lib/permisos'
import { choques, esPrincipal, pagadoDe, pagadoPorReserva, saldo } from '../lib/reservas'
import { ESTADOS_RESERVA, METODOS_PAGO, MODALIDADES, TIPOS_UNIDAD, type MetodoPago } from '../lib/types'
import { linkWhatsApp } from '../lib/whatsapp'
import { useGuardar, useUsuario } from '../sesion'
import { ReservaForm } from './ReservaForm'
import { Campo, Etiqueta, Modal } from './ui'

export function ReservaDetalle({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const yo = useUsuario()
  const { dato: r, cargando } = useDoc(doc(C.reservas, id), `reserva:${id}`)
  const pagos = useLista(q.pagosDeReserva(id), `pagos-reserva:${id}`)
  const cliente = useDoc(r ? doc(C.clientes, r.clienteId) : null, `cliente:${r?.clienteId}`)
  const reservas = useLista(r ? q.reservasDeTemporada(r.temporada) : null, `reservas:${r?.temporada}`)
  const [editando, setEditando] = useState(false)
  const [cobrando, setCobrando] = useState(false)
  const [notas, setNotas] = useState<string | null>(null)
  const { guardar, guardando, error, setError } = useGuardar()

  if (editando && r) return <ReservaForm reserva={r} onCerrar={() => setEditando(false)} />

  if (!r) {
    return (
      <Modal titulo="Reserva" onCerrar={onCerrar}>
        <div className="modal-cuerpo">{cargando ? 'Cargando…' : 'Esta reserva ya no existe.'}</div>
      </Modal>
    )
  }

  const importada = r.origen === 'importada'
  const pagado = pagadoDe(r, pagadoPorReserva(pagos.datos))
  const debe = saldo(r, pagado)
  // Las importadas se gestionan en el sistema de reservas: acá sólo se miran.
  const edita = puedeEditar(yo.rol) && !importada
  const admin = esAdmin(yo.rol)
  const hermanas = importada ? reservas.datos.filter((x) => x.externoId === r.externoId && x.id !== r.id) : []
  const principal = hermanas.find(esPrincipal)
  const wa = cliente.dato?.telefono ? linkWhatsApp(cliente.dato.telefono) : null
  const pagosOrdenados = [...pagos.datos].sort((a, b) => b.fecha.localeCompare(a.fecha))

  async function cancelar() {
    if (!r || !confirm(`¿Cancelar la reserva de ${r.clienteNombre} en ${r.unidadCodigo}? La unidad queda libre.`)) return
    await guardar(() => actualizar(C.reservas, r.id, { estado: 'cancelada' }), 'Reserva cancelada.')
  }

  async function reactivar() {
    if (!r) return
    const ch = choques(reservas.datos, r, r.id)
    if (ch.length) return setError(`No se puede reactivar: ${r.unidadCodigo} ya está tomada por ${ch[0]!.clienteNombre} en esas fechas.`)
    await guardar(() => actualizar(C.reservas, r.id, { estado: 'pendiente' }), 'Reserva reactivada como pendiente.')
  }

  async function eliminar() {
    if (!r) return
    if (pagos.datos.length) return setError('Tiene pagos cargados: borralos primero o cancelá la reserva.')
    if (!confirm('¿Borrar la reserva? No se puede deshacer. Si el cliente desistió, mejor cancelarla.')) return
    if (await guardar(() => borrar(C.reservas, r.id), 'Reserva borrada.')) onCerrar()
  }

  async function borrarPago(pid: string, monto: number) {
    if (!confirm(`¿Borrar el pago de ${pesos(monto)}?`)) return
    await guardar(() => borrar(C.pagos, pid), 'Pago borrado.')
  }

  return (
    <>
      <Modal
        titulo={`${r.unidadCodigo} · ${r.clienteNombre}`}
        onCerrar={onCerrar}
        ancho={680}
        pie={
          <>
            {admin && <button type="button" className="btn btn-peligro izq" onClick={eliminar} disabled={guardando}>Borrar</button>}
            {edita && r.estado !== 'cancelada' && (
              <button type="button" className="btn btn-sec" onClick={cancelar} disabled={guardando}>Cancelar reserva</button>
            )}
            {edita && r.estado === 'cancelada' && (
              <button type="button" className="btn btn-sec" onClick={reactivar} disabled={guardando}>Reactivar</button>
            )}
            {edita && r.estado === 'pendiente' && (
              <button type="button" className="btn btn-sec" disabled={guardando}
                onClick={() => guardar(() => actualizar(C.reservas, r.id, { estado: 'confirmada' }), 'Reserva confirmada.')}>
                Confirmar
              </button>
            )}
            {edita && <button type="button" className="btn btn-sec" onClick={() => setEditando(true)}>Editar</button>}
            {edita && r.estado !== 'cancelada' && (
              <button type="button" className="btn" onClick={() => setCobrando(true)}>Registrar pago</button>
            )}
          </>
        }
      >
        <div className="modal-cuerpo">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Etiqueta clase={r.estado}>{ESTADOS_RESERVA[r.estado]}</Etiqueta>
            {debe > 0 && <Etiqueta clase="deuda">Debe {pesos(debe)}</Etiqueta>}
            {debe === 0 && r.estado !== 'cancelada' && r.precio > 0 && <Etiqueta clase="confirmada">Pagada</Etiqueta>}
          </div>
          {importada && (
            <p className="nota">
              Reserva #{r.externoId} del sistema de reservas. Se gestiona allá; acá se actualiza al volver a importar.
            </p>
          )}
          <dl className="ficha">
            <dt>Unidad</dt><dd>{TIPOS_UNIDAD[r.unidadTipo]} {r.unidadCodigo}</dd>
            <dt>Cliente</dt>
            <dd>
              <Link to={`/clientes/${r.clienteId}`} onClick={onCerrar}>{r.clienteNombre}</Link>
              {cliente.dato?.telefono && <span className="secundario"> · {cliente.dato.telefono}</span>}
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-sec btn-chico" style={{ marginLeft: 8 }}>
                  <MessageCircle size={14} />WhatsApp
                </a>
              )}
            </dd>
            <dt>Fechas</dt><dd>{rango(r.desde, r.hasta)} · {plural(diasIncluidos(r.desde, r.hasta), 'día', 'días')}</dd>
            <dt>Modalidad</dt><dd>{MODALIDADES[r.modalidad]} · temporada {r.temporada}</dd>
            {hermanas.length > 0 && (
              <><dt>Misma reserva</dt><dd>{hermanas.map((x) => `${TIPOS_UNIDAD[x.unidadTipo]} ${x.unidadCodigo}`).join(', ')}</dd></>
            )}
            {esPrincipal(r) ? (
              <>
                <dt>Precio</dt>
                <dd>{pesos(r.precio)}{importada && r.precio <= 1 && <span className="secundario"> · sin importe cargado en el sistema</span>}</dd>
                <dt>Pagado</dt><dd>{pesos(pagado)}</dd>
              </>
            ) : (
              <><dt>Precio</dt><dd className="secundario">Incluido en {principal ? principal.unidadCodigo : 'la unidad principal'}</dd></>
            )}
            {r.reservadaEl && (<><dt>Reservada el</dt><dd>{fechaCorta(r.reservadaEl)} {r.reservadaEl.slice(0, 4)}</dd></>)}
            {r.notas && (<><dt>Notas</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.notas}</dd></>)}
            <dt>Cargada</dt>
            <dd className="secundario">{r.creado ? r.creado.toDate().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—'} por {r.creadoPor}</dd>
          </dl>

          {importada && admin && (
            notas == null ? (
              <button type="button" className="btn btn-sec btn-chico" style={{ justifySelf: 'start' }} onClick={() => setNotas(r.notas)}>
                {r.notas ? 'Editar notas' : 'Agregar notas'}
              </button>
            ) : (
              <Campo label="Notas" ayuda="Se conservan al volver a importar.">
                <textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={2000} autoFocus />
                <span className="acciones" style={{ marginTop: 6 }}>
                  <button type="button" className="btn btn-sec btn-chico" onClick={() => setNotas(null)}>Cancelar</button>
                  <button type="button" className="btn btn-chico" disabled={guardando}
                    onClick={async () => {
                      if (await guardar(() => actualizar(C.reservas, r.id, { notas: notas.trim() }), 'Notas guardadas.')) setNotas(null)
                    }}>Guardar notas</button>
                </span>
              </Campo>
            )
          )}

          {!importada && (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Pagos</h3>
            {pagosOrdenados.length === 0 ? (
              <p className="secundario">Sin pagos todavía.</p>
            ) : (
              <table>
                <tbody>
                  {pagosOrdenados.map((p) => (
                    <tr key={p.id}>
                      <td>{fechaCorta(p.fecha)}</td>
                      <td>{METODOS_PAGO[p.metodo]}{p.nota && <div className="secundario">{p.nota}</div>}</td>
                      <td className="secundario ocultar-movil">{p.creadoPor}</td>
                      <td className="num">{pesos(p.monto)}</td>
                      {admin && (
                        <td style={{ width: 1 }}>
                          <button type="button" className="btn btn-sec btn-icono" aria-label="Borrar pago" onClick={() => borrarPago(p.id, p.monto)}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          )}
          {error && <p className="aviso">{error}</p>}
        </div>
      </Modal>
      {cobrando && (
        <PagoForm
          reservaId={r.id} clienteId={r.clienteId} clienteNombre={r.clienteNombre} unidadCodigo={r.unidadCodigo}
          temporada={r.temporada} sugerido={debe} onCerrar={() => setCobrando(false)}
        />
      )}
    </>
  )
}

function PagoForm(props: {
  reservaId: string; clienteId: string; clienteNombre: string; unidadCodigo: string; temporada: string
  sugerido: number; onCerrar: () => void
}) {
  const [monto, setMonto] = useState(props.sugerido > 0 ? String(props.sugerido) : '')
  const [metodo, setMetodo] = useState<MetodoPago>('transferencia')
  const [fecha, setFecha] = useState(hoy())
  const [nota, setNota] = useState('')
  const { guardar, guardando, error, setError } = useGuardar()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const m = leerPesos(monto)
    if (!m || m <= 0) return setError('El monto tiene que ser mayor a cero.')
    const { reservaId, clienteId, clienteNombre, unidadCodigo, temporada } = props
    const ok = await guardar(
      () => crear(C.pagos, { reservaId, clienteId, clienteNombre, unidadCodigo, temporada, monto: m, metodo, fecha, nota: nota.trim() }),
      `Pago de ${pesos(m)} registrado.`,
    )
    if (ok) props.onCerrar()
  }

  return (
    <Modal titulo={`Pago · ${props.unidadCodigo} · ${props.clienteNombre}`} onCerrar={props.onCerrar}>
      <form onSubmit={enviar}>
        <div className="modal-cuerpo">
          <div className="fila-campos">
            <Campo label="Monto" ayuda={leerPesos(monto) ? pesos(leerPesos(monto)!) : props.sugerido > 0 ? `Saldo: ${pesos(props.sugerido)}` : undefined}>
              <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" required autoFocus />
            </Campo>
            <Campo label="Medio de pago">
              <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
                {Object.entries(METODOS_PAGO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo label="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></Campo>
          </div>
          <Campo label="Nota" ayuda="Nº de operación, quién pagó, etc.">
            <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} />
          </Campo>
          <p className="secundario">Los pagos no se editan: si te equivocás, un administrador lo borra y lo cargás de nuevo.</p>
          {error && <p className="aviso">{error}</p>}
        </div>
        <div className="modal-pie">
          <button type="button" className="btn btn-sec" onClick={props.onCerrar}>Cancelar</button>
          <button type="submit" className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar'}</button>
        </div>
      </form>
    </Modal>
  )
}
