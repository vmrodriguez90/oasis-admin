import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { doc, getDocs, limit, query, where } from 'firebase/firestore'
import { ArrowLeft, MessageCircle, Plus } from 'lucide-react'
import { ClienteForm } from '../components/ClienteForm'
import { ReservaDetalle } from '../components/ReservaDetalle'
import { ReservaForm } from '../components/ReservaForm'
import { Cabecera, Cargando, Etiqueta, Vacio } from '../components/ui'
import { C, borrar, q, useDoc, useLista } from '../lib/db'
import { pesos } from '../lib/dinero'
import { fechaCorta, plural, rango } from '../lib/fechas'
import { esAdmin, puedeEditar } from '../lib/permisos'
import { activa, claveReserva, pagadoDe, pagadoPorReserva, saldo } from '../lib/reservas'
import { ESTADOS_RESERVA, METODOS_PAGO, TIPOS_UNIDAD } from '../lib/types'
import { linkWhatsApp } from '../lib/whatsapp'
import { useGuardar, useUsuario } from '../sesion'

export function ClienteDetalle() {
  const { id = '' } = useParams()
  const yo = useUsuario()
  const navegar = useNavigate()
  const { dato: c, cargando } = useDoc(doc(C.clientes, id), `cliente:${id}`)
  // Todas las temporadas: la ficha es la historia completa del cliente.
  const reservas = useLista(q.reservasDeCliente(id), `reservas-cliente:${id}`)
  const pagos = useLista(q.pagosDeCliente(id), `pagos-cliente:${id}`)
  const [editando, setEditando] = useState(false)
  const [reservando, setReservando] = useState(false)
  const [verId, setVerId] = useState<string | null>(null)
  const { guardar, error, setError } = useGuardar()

  const filas = useMemo(() => {
    const pagado = pagadoPorReserva(pagos.datos)
    return reservas.datos
      .map((r) => {
        const p = pagadoDe(r, pagado)
        return { ...r, pagado: p, saldo: saldo(r, p) }
      })
      .sort((a, b) => b.desde.localeCompare(a.desde))
  }, [reservas.datos, pagos.datos])

  if (cargando) return <Cargando />
  if (!c) return <Vacio titulo="Este cliente no existe"><Link to="/clientes">Volver a clientes</Link></Vacio>

  const deuda = filas.reduce((n, r) => n + r.saldo, 0)
  // Lo cargado acá más lo que el sistema de reservas da por cobrado en las importadas.
  const total = filas.reduce((n, r) => n + r.pagado, 0)
  const importadas = filas.some((r) => r.origen === 'importada')
  const wa = linkWhatsApp(c.telefono)
  const edita = puedeEditar(yo.rol)

  async function eliminar() {
    if (!c) return
    // Las reservas del cliente se buscan en el servidor, no sólo en las cargadas.
    const tiene = await getDocs(query(C.reservas, where('clienteId', '==', c.id), limit(1)))
    if (!tiene.empty) return setError('Tiene reservas: no se puede borrar. Si es un duplicado, pasale las reservas al otro primero.')
    if (!confirm(`¿Borrar a ${c.nombre}? No se puede deshacer.`)) return
    if (await guardar(() => borrar(C.clientes, c.id), 'Cliente borrado.')) navegar('/clientes')
  }

  return (
    <>
      <Link to="/clientes" className="secundario" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <ArrowLeft size={15} />Clientes
      </Link>
      <Cabecera titulo={c.nombre}>
        {wa && <a className="btn btn-sec" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />WhatsApp</a>}
        {edita && <button type="button" className="btn btn-sec" onClick={() => setEditando(true)}>Editar</button>}
        {edita && <button type="button" className="btn" onClick={() => setReservando(true)}><Plus size={17} />Reserva</button>}
      </Cabecera>

      <div className="grilla g-3" style={{ marginBottom: 16 }}>
        <div className="tarjeta">
          <div className="cifra-label">Saldo pendiente</div>
          <div className={deuda > 0 ? 'cifra deuda' : 'cifra'}>{pesos(deuda)}</div>
        </div>
        <div className="tarjeta">
          <div className="cifra-label">Pagó en total</div>
          <div className="cifra">{pesos(total)}</div>
          <div className="cifra-sub">
            {importadas ? 'según el sistema de reservas y los pagos de acá' : plural(pagos.datos.length, 'pago', 'pagos')}
          </div>
        </div>
        <div className="tarjeta">
          <div className="cifra-label">Reservas</div>
          <div className="cifra">{new Set(filas.filter(activa).map(claveReserva)).size}</div>
          <div className="cifra-sub">{plural(new Set(filas.map((r) => r.temporada)).size, 'temporada', 'temporadas')}</div>
        </div>
      </div>

      <div className="grilla g-2" style={{ alignItems: 'start' }}>
        <section className="tarjeta">
          <h2>Datos</h2>
          <dl className="ficha" style={{ marginTop: 10 }}>
            <dt>Teléfono</dt><dd>{c.telefono || '—'}</dd>
            <dt>Email</dt><dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</dd>
            <dt>DNI</dt><dd>{c.documento || '—'}</dd>
            <dt>Notas</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{c.notas || '—'}</dd>
            <dt>Alta</dt><dd className="secundario">{c.creado?.toDate().toLocaleDateString('es-AR') ?? '—'} por {c.creadoPor}</dd>
          </dl>
          {esAdmin(yo.rol) && (
            <button type="button" className="btn btn-peligro btn-chico" style={{ marginTop: 14 }} onClick={eliminar}>Borrar cliente</button>
          )}
          {error && <p className="aviso" style={{ marginTop: 10 }}>{error}</p>}
        </section>

        <section className="tarjeta">
          <h2>Pagos cargados acá</h2>
          {pagos.datos.length === 0 ? (
            <p className="secundario" style={{ marginTop: 8 }}>
              {importadas ? 'Los cobros de las reservas importadas están en el sistema de reservas.' : 'Sin pagos.'}
            </p>
          ) : (
            <table style={{ marginTop: 6 }}>
              <tbody>
                {[...pagos.datos].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((p) => (
                  <tr key={p.id} className="clic" onClick={() => setVerId(p.reservaId)}>
                    <td>{fechaCorta(p.fecha)} <span className="secundario">{p.fecha.slice(0, 4)}</span></td>
                    <td>{p.unidadCodigo}</td>
                    <td className="ocultar-movil">{METODOS_PAGO[p.metodo]}</td>
                    <td className="num">{pesos(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: '24px 0 10px' }}>Reservas</h2>
      <div className="tabla-envoltorio">
        {filas.length === 0 ? <Vacio titulo="Sin reservas" /> : (
          <table>
            <thead><tr><th>Temporada</th><th>Unidad</th><th>Fechas</th><th className="num">Precio</th><th className="num">Saldo</th><th>Estado</th></tr></thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.id} className="clic" tabIndex={0} onClick={() => setVerId(r.id)} onKeyDown={(e) => e.key === 'Enter' && setVerId(r.id)}>
                  <td>{r.temporada}</td>
                  <td>
                    {TIPOS_UNIDAD[r.unidadTipo]} <b>{r.unidadCodigo}</b>
                    {r.externoId && <div className="secundario">#{r.externoId}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{rango(r.desde, r.hasta)}</td>
                  <td className="num">{r.precio || !r.externoId ? pesos(r.precio) : <span className="secundario">en otra unidad</span>}</td>
                  <td className={r.saldo > 0 ? 'num deuda' : 'num'}>{r.saldo > 0 ? pesos(r.saldo) : '—'}</td>
                  <td><Etiqueta clase={r.estado}>{ESTADOS_RESERVA[r.estado]}</Etiqueta></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editando && <ClienteForm cliente={c} onCerrar={() => setEditando(false)} />}
      {reservando && <ReservaForm prellenado={{ clienteId: c.id }} onCerrar={() => setReservando(false)} />}
      {verId && <ReservaDetalle id={verId} onCerrar={() => setVerId(null)} />}
    </>
  )
}
