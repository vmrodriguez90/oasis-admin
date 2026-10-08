import { useMemo, useState, type FormEvent } from 'react'
import { deleteDoc, doc, getDocs, limit, query, updateDoc, where, writeBatch } from 'firebase/firestore'
import { Plus } from 'lucide-react'
import { Cabecera, Campo, ErrorCarga, Modal, Vacio } from '../components/ui'
import { db } from '../firebase'
import { C, propagarCambio, useLista } from '../lib/db'
import { ordenarUnidades } from '../lib/reservas'
import { PREFIJO_UNIDAD, TIPOS_UNIDAD, type ConId, type TipoUnidad, type Unidad } from '../lib/types'
import { useGuardar } from '../sesion'

export function Unidades() {
  const unidades = useLista(C.unidades, 'unidades')
  const [editar, setEditar] = useState<ConId<Unidad> | 'serie' | null>(null)
  const { guardar, error, setError } = useGuardar()

  const grupos = useMemo(() => {
    const m = new Map<TipoUnidad, ConId<Unidad>[]>()
    for (const u of ordenarUnidades(unidades.datos)) m.set(u.tipo, [...(m.get(u.tipo) ?? []), u])
    return [...m]
  }, [unidades.datos])

  async function eliminar(u: ConId<Unidad>) {
    const usada = await getDocs(query(C.reservas, where('unidadId', '==', u.id), limit(1)))
    if (!usada.empty) return setError(`${u.codigo} tiene reservas: desactivala en vez de borrarla.`)
    if (!confirm(`¿Borrar ${u.codigo}?`)) return
    await guardar(() => deleteDoc(doc(C.unidades, u.id)), `${u.codigo} borrada.`)
  }

  return (
    <>
      <Cabecera titulo="Unidades" sub="Carpas, sombrillas, guorums, cocheras y quincho. Las inactivas no aparecen en el mapa ni se pueden reservar.">
        <button type="button" className="btn" onClick={() => setEditar('serie')}><Plus size={17} />Agregar</button>
      </Cabecera>
      <ErrorCarga error={unidades.error} />
      {error && <p className="aviso" style={{ marginBottom: 12 }}>{error}</p>}

      {grupos.length === 0 ? (
        <div className="tarjeta"><Vacio titulo={unidades.cargando ? 'Cargando…' : 'Todavía no hay unidades'}>Se crean solas al importar el archivo del sistema de reservas, o agregalas de a muchas: «C-01 a C-40».</Vacio></div>
      ) : grupos.map(([tipo, us]) => (
        <section key={tipo} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{TIPOS_UNIDAD[tipo]}s · {us.filter((u) => u.activa).length} activas</h2>
          <div className="tabla-envoltorio">
            <table>
              <thead><tr><th>Código</th><th>Sector</th><th className="num">Orden</th><th>Activa</th><th /></tr></thead>
              <tbody>
                {us.map((u) => (
                  <tr key={u.id}>
                    <td><b className={u.activa ? undefined : 'tachado'}>{u.codigo}</b></td>
                    <td>{u.sector || <span className="secundario">—</span>}</td>
                    <td className="num">{u.orden}</td>
                    <td>
                      <input type="checkbox" checked={u.activa} aria-label={`${u.codigo} activa`}
                        onChange={(e) => guardar(() => updateDoc(doc(C.unidades, u.id), { activa: e.target.checked }))} />
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-sec btn-chico" onClick={() => setEditar(u)}>Editar</button>{' '}
                      <button type="button" className="btn btn-peligro btn-chico" onClick={() => eliminar(u)}>Borrar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {editar === 'serie' && <SerieForm existentes={unidades.datos} onCerrar={() => setEditar(null)} />}
      {editar && editar !== 'serie' && <UnidadForm unidad={editar} onCerrar={() => setEditar(null)} />}
    </>
  )
}

function SerieForm({ existentes, onCerrar }: { existentes: ConId<Unidad>[]; onCerrar: () => void }) {
  const [tipo, setTipo] = useState<TipoUnidad>('carpa')
  const [prefijo, setPrefijo] = useState(PREFIJO_UNIDAD.carpa)
  const [desde, setDesde] = useState('1')
  const [hasta, setHasta] = useState('1')
  const [sector, setSector] = useState('')
  const { guardar, guardando, error, setError } = useGuardar()

  const a = Number(desde)
  const b = Number(hasta)
  const valido = Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= a && b - a < 300
  const digitos = String(Math.max(b, 10)).length
  const codigos = valido ? Array.from({ length: b - a + 1 }, (_, i) => `${prefijo}${String(a + i).padStart(digitos, '0')}`) : []
  const usados = new Set(existentes.map((u) => u.codigo.toLowerCase()))
  const repetidos = codigos.filter((c) => usados.has(c.toLowerCase()))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!valido) return setError('Revisá los números: "hasta" tiene que ser mayor o igual que "desde" (máximo 300 por vez).')
    if (repetidos.length) return setError(`Ya existen: ${repetidos.slice(0, 5).join(', ')}${repetidos.length > 5 ? '…' : ''}`)
    const ok = await guardar(async () => {
      const lote = writeBatch(db)
      codigos.forEach((codigo, i) => lote.set(doc(C.unidades), { codigo, tipo, sector: sector.trim(), orden: a + i, activa: true }))
      await lote.commit()
    }, `${codigos.length} ${TIPOS_UNIDAD[tipo].toLowerCase()}s agregadas.`)
    if (ok) onCerrar()
  }

  return (
    <Modal titulo="Agregar unidades" onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        <div className="modal-cuerpo">
          <div className="fila-campos">
            <Campo label="Tipo">
              <select value={tipo} onChange={(e) => {
                const t = e.target.value as TipoUnidad
                setTipo(t)
                setPrefijo(PREFIJO_UNIDAD[t])
              }}>
                {Object.entries(TIPOS_UNIDAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo label="Prefijo"><input value={prefijo} onChange={(e) => setPrefijo(e.target.value)} maxLength={8} /></Campo>
            <Campo label="Sector" ayuda="Opcional: «Fila 1», «Frente al mar»…"><input value={sector} onChange={(e) => setSector(e.target.value)} maxLength={40} /></Campo>
          </div>
          <div className="fila-campos">
            <Campo label="Desde el número"><input value={desde} onChange={(e) => setDesde(e.target.value)} inputMode="numeric" /></Campo>
            <Campo label="Hasta el número"><input value={hasta} onChange={(e) => setHasta(e.target.value)} inputMode="numeric" /></Campo>
          </div>
          {codigos.length > 0 && (
            <p className="nota">
              Se van a crear {codigos.length}: {codigos.length <= 6 ? codigos.join(', ') : `${codigos.slice(0, 3).join(', ')} … ${codigos.at(-1)}`}
            </p>
          )}
          {error && <p className="aviso">{error}</p>}
        </div>
        <div className="modal-pie">
          <button type="button" className="btn btn-sec" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn" disabled={guardando || !valido}>{guardando ? 'Guardando…' : 'Agregar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function UnidadForm({ unidad, onCerrar }: { unidad: ConId<Unidad>; onCerrar: () => void }) {
  const [codigo, setCodigo] = useState(unidad.codigo)
  const [sector, setSector] = useState(unidad.sector)
  const [orden, setOrden] = useState(String(unidad.orden))
  const { guardar, guardando, error, setError } = useGuardar()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const c = codigo.trim()
    if (!c) return setError('Falta el código.')
    if (!Number.isInteger(Number(orden))) return setError('El orden tiene que ser un número entero.')
    const ok = await guardar(async () => {
      await updateDoc(doc(C.unidades, unidad.id), { codigo: c, sector: sector.trim(), orden: Number(orden) })
      if (c !== unidad.codigo) await propagarCambio('unidadCodigo', 'unidadId', unidad.id, c)
    }, 'Unidad actualizada.')
    if (ok) onCerrar()
  }

  return (
    <Modal titulo={`Editar ${unidad.codigo}`} onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        <div className="modal-cuerpo">
          <div className="fila-campos">
            <Campo label="Código"><input value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={20} required /></Campo>
            <Campo label="Sector"><input value={sector} onChange={(e) => setSector(e.target.value)} maxLength={40} /></Campo>
            <Campo label="Orden" ayuda="Posición en el mapa"><input value={orden} onChange={(e) => setOrden(e.target.value)} inputMode="numeric" /></Campo>
          </div>
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
