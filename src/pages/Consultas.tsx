import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { doc, limit, orderBy, query, writeBatch } from 'firebase/firestore'
import { MessageCircle, Plus, UserPlus } from 'lucide-react'
import { Cabecera, Campo, ErrorCarga, Etiqueta, Modal, Vacio } from '../components/ui'
import { db } from '../firebase'
import { C, actualizar, conAuditoria, crear, useLista } from '../lib/db'
import { puedeEditar } from '../lib/permisos'
import {
  CANALES, ESTADOS_CONSULTA, INTERESES,
  type CanalConsulta, type ConId, type Consulta, type EstadoConsulta, type InteresConsulta,
} from '../lib/types'
import { linkWhatsApp } from '../lib/whatsapp'
import { useGuardar, useUsuario } from '../sesion'

type Filtro = EstadoConsulta | 'abiertas' | 'todas'
const FILTROS: [Filtro, string][] = [
  ['abiertas', 'Abiertas'], ['nueva', 'Nuevas'], ['en_curso', 'En curso'], ['ganada', 'Ganadas'], ['perdida', 'Perdidas'], ['todas', 'Todas'],
]

const consultasRecientes = query(C.consultas, orderBy('creado', 'desc'), limit(500))

function hace(c: Consulta): string {
  if (!c.creado) return ''
  const dias = Math.floor((Date.now() - c.creado.toMillis()) / 86_400_000)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  return c.creado.toDate().toLocaleDateString('es-AR')
}

export function Consultas() {
  const yo = useUsuario()
  const edita = puedeEditar(yo.rol)
  const consultas = useLista(consultasRecientes, 'consultas')
  const [filtro, setFiltro] = useState<Filtro>('abiertas')
  const [buscar, setBuscar] = useState('')
  const [editar, setEditar] = useState<ConId<Consulta> | 'nueva' | null>(null)
  const { guardar, error } = useGuardar()

  const filas = useMemo(() => {
    const t = buscar.trim().toLowerCase()
    return consultas.datos.filter((c) => {
      if (filtro === 'abiertas' && (c.estado === 'ganada' || c.estado === 'perdida')) return false
      if (filtro !== 'abiertas' && filtro !== 'todas' && c.estado !== filtro) return false
      return !t || `${c.nombre} ${c.contacto} ${c.mensaje} ${c.fechas}`.toLowerCase().includes(t)
    })
  }, [consultas.datos, filtro, buscar])

  const cuenta = (f: Filtro) => consultas.datos.filter((c) =>
    f === 'todas' ? true : f === 'abiertas' ? c.estado === 'nueva' || c.estado === 'en_curso' : c.estado === f).length

  function cambiarEstado(c: ConId<Consulta>, estado: EstadoConsulta) {
    return guardar(() => actualizar(C.consultas, c.id, { estado }))
  }

  /** Crea el cliente a partir de la consulta y los deja vinculados, en un solo lote. */
  function hacerCliente(c: ConId<Consulta>) {
    const esMail = c.contacto.includes('@')
    return guardar(async () => {
      const lote = writeBatch(db)
      const ref = doc(C.clientes)
      lote.set(ref, conAuditoria({
        nombre: c.nombre, telefono: esMail ? '' : c.contacto, email: esMail ? c.contacto : '', documento: '',
        notas: c.mensaje ? `Consulta: ${c.mensaje}` : '',
      }))
      lote.update(doc(C.consultas, c.id), { clienteId: ref.id })
      await lote.commit()
    }, `${c.nombre} ya es cliente.`)
  }

  return (
    <>
      <Cabecera titulo="Consultas" sub="Pedidos de información que llegan por WhatsApp, teléfono, redes o en persona.">
        {edita && <button type="button" className="btn" onClick={() => setEditar('nueva')}><Plus size={17} />Nueva consulta</button>}
      </Cabecera>

      <div className="filtros">
        <div className="pestanas" role="group" aria-label="Filtrar consultas">
          {FILTROS.map(([f, t]) => (
            <button type="button" key={f} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{t} · {cuenta(f)}</button>
          ))}
        </div>
        <input className="input buscar" type="search" placeholder="Buscar" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar" />
      </div>

      <ErrorCarga error={consultas.error} />
      {error && <p className="aviso" style={{ marginBottom: 12 }}>{error}</p>}
      {filas.length === 0 ? (
        <div className="tarjeta"><Vacio titulo={consultas.cargando ? 'Cargando…' : 'No hay consultas acá'} /></div>
      ) : (
        <div className="grilla g-2" style={{ alignItems: 'start' }}>
          {filas.map((c) => {
            const wa = linkWhatsApp(c.contacto)
            return (
              <article className="tarjeta" key={c.id} style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                <div className="tarjeta-cab">
                  <div style={{ minWidth: 0 }}>
                    <h2>{c.nombre}</h2>
                    <div className="secundario">
                      {CANALES[c.canal]} · {hace(c)}{c.contacto && ` · ${c.contacto}`}
                    </div>
                  </div>
                  <Etiqueta clase={c.estado}>{ESTADOS_CONSULTA[c.estado]}</Etiqueta>
                </div>
                <div style={{ fontSize: 14 }}>
                  <b>{INTERESES[c.interes]}</b>{c.fechas && ` · ${c.fechas}`}
                  {c.mensaje && <p style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{c.mensaje}</p>}
                </div>
                <div className="acciones">
                  {edita && (
                    <select className="input" style={{ width: 'auto', minHeight: 30, padding: '2px 8px', fontSize: 13 }}
                      value={c.estado} aria-label="Estado" onChange={(e) => cambiarEstado(c, e.target.value as EstadoConsulta)}>
                      {Object.entries(ESTADOS_CONSULTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  )}
                  {wa && (
                    <a className="btn btn-sec btn-chico" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />WhatsApp</a>
                  )}
                  {c.clienteId ? (
                    <Link className="btn btn-sec btn-chico" to={`/clientes/${c.clienteId}`}>Ver cliente</Link>
                  ) : edita && (
                    <button type="button" className="btn btn-sec btn-chico" onClick={() => hacerCliente(c)}><UserPlus size={14} />Hacer cliente</button>
                  )}
                  {edita && <button type="button" className="btn btn-sec btn-chico" onClick={() => setEditar(c)}>Editar</button>}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editar && <ConsultaForm consulta={editar === 'nueva' ? undefined : editar} onCerrar={() => setEditar(null)} />}
    </>
  )
}

function ConsultaForm({ consulta, onCerrar }: { consulta?: ConId<Consulta>; onCerrar: () => void }) {
  const [d, setD] = useState({
    nombre: consulta?.nombre ?? '',
    contacto: consulta?.contacto ?? '',
    canal: consulta?.canal ?? ('whatsapp' as CanalConsulta),
    interes: consulta?.interes ?? ('carpa' as InteresConsulta),
    fechas: consulta?.fechas ?? '',
    mensaje: consulta?.mensaje ?? '',
    estado: consulta?.estado ?? ('nueva' as EstadoConsulta),
  })
  const { guardar, guardando, error, setError } = useGuardar()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!d.nombre.trim()) return setError('Falta el nombre.')
    const datos = { ...d, nombre: d.nombre.trim(), contacto: d.contacto.trim(), fechas: d.fechas.trim(), mensaje: d.mensaje.trim() }
    const ok = await guardar(
      () => (consulta ? actualizar(C.consultas, consulta.id, datos) : crear(C.consultas, { ...datos, clienteId: null })),
      consulta ? 'Consulta actualizada.' : 'Consulta cargada.',
    )
    if (ok) onCerrar()
  }

  return (
    <Modal titulo={consulta ? 'Editar consulta' : 'Nueva consulta'} onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        <div className="modal-cuerpo">
          <div className="fila-campos">
            <Campo label="Nombre"><input value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} maxLength={120} required autoFocus /></Campo>
            <Campo label="Teléfono o email"><input value={d.contacto} onChange={(e) => setD({ ...d, contacto: e.target.value })} maxLength={120} /></Campo>
          </div>
          <div className="fila-campos">
            <Campo label="Canal">
              <select value={d.canal} onChange={(e) => setD({ ...d, canal: e.target.value as CanalConsulta })}>
                {Object.entries(CANALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo label="Le interesa">
              <select value={d.interes} onChange={(e) => setD({ ...d, interes: e.target.value as InteresConsulta })}>
                {Object.entries(INTERESES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo label="Estado">
              <select value={d.estado} onChange={(e) => setD({ ...d, estado: e.target.value as EstadoConsulta })}>
                {Object.entries(ESTADOS_CONSULTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
          </div>
          <Campo label="Fechas" ayuda="Como lo dijo: «segunda quincena de enero», «temporada completa»…">
            <input value={d.fechas} onChange={(e) => setD({ ...d, fechas: e.target.value })} maxLength={120} />
          </Campo>
          <Campo label="Mensaje o notas"><textarea value={d.mensaje} onChange={(e) => setD({ ...d, mensaje: e.target.value })} maxLength={2000} /></Campo>
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
