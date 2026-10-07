import { useMemo, useState, type FormEvent } from 'react'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { C, conAuditoria, porId, q, useLista } from '../lib/db'
import { leerPesos, pesos } from '../lib/dinero'
import { diasIncluidos, esFechaValida, hoy, plural, rango, sumarDias, temporadaDe } from '../lib/fechas'
import { choques, ordenarUnidades } from '../lib/reservas'
import {
  ESTADOS_RESERVA, MODALIDADES, TIPOS_UNIDAD,
  type ConId, type EstadoReserva, type Modalidad, type Reserva, type TipoUnidad,
} from '../lib/types'
import { useGuardar } from '../sesion'
import { Campo, Modal } from './ui'

const DURACION: Partial<Record<Modalidad, number>> = { dia: 1, semana: 7, quincena: 15, mes: 30 }

export interface Prellenado {
  unidadId?: string
  clienteId?: string
  desde?: string
}

export function ReservaForm({
  reserva, prellenado, onCerrar,
}: { reserva?: ConId<Reserva>; prellenado?: Prellenado; onCerrar: () => void }) {
  const inicioDesde = reserva?.desde ?? prellenado?.desde ?? hoy()
  const [clienteId, setClienteId] = useState(reserva?.clienteId ?? prellenado?.clienteId ?? '')
  const [buscar, setBuscar] = useState('')
  const [nuevo, setNuevo] = useState<{ nombre: string; telefono: string } | null>(null)
  const [unidadId, setUnidadId] = useState(reserva?.unidadId ?? prellenado?.unidadId ?? '')
  const [desde, setDesde] = useState(inicioDesde)
  const [hasta, setHasta] = useState(reserva?.hasta ?? inicioDesde)
  const [modalidad, setModalidad] = useState<Modalidad>(reserva?.modalidad ?? 'dia')
  const [precio, setPrecio] = useState(reserva ? String(reserva.precio) : '')
  const [estado, setEstado] = useState<EstadoReserva>(reserva?.estado === 'confirmada' ? 'confirmada' : 'pendiente')
  const [notas, setNotas] = useState(reserva?.notas ?? '')
  const { guardar, guardando, error, setError } = useGuardar()

  const temporada = esFechaValida(desde) ? temporadaDe(desde) : ''
  const unidades = useLista(C.unidades, 'unidades')
  const clientes = useLista(C.clientes, 'clientes')
  const reservas = useLista(temporada ? q.reservasDeTemporada(temporada) : null, `reservas:${temporada}`)
  const pagosReserva = useLista(reserva ? q.pagosDeReserva(reserva.id) : null, `pagos-reserva:${reserva?.id}`)

  const fechasOk = esFechaValida(desde) && esFechaValida(hasta) && desde <= hasta
  const choquesPorUnidad = useMemo(() => {
    const m = new Map<string, ConId<Reserva>[]>()
    if (!fechasOk) return m
    for (const u of unidades.datos) m.set(u.id, choques(reservas.datos, { unidadId: u.id, desde, hasta }, reserva?.id))
    return m
  }, [unidades.datos, reservas.datos, desde, hasta, fechasOk, reserva?.id])

  const unidadesOrdenadas = ordenarUnidades(unidades.datos.filter((u) => u.activa || u.id === unidadId))
  const unidadSel = porId(unidades.datos).get(unidadId)
  const choqueSel = choquesPorUnidad.get(unidadId) ?? []

  const clientesFiltrados = useMemo(() => {
    const t = buscar.trim().toLowerCase()
    const xs = [...clientes.datos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    if (!t) return xs.slice(0, 50)
    return xs.filter((c) => `${c.nombre} ${c.telefono} ${c.documento}`.toLowerCase().includes(t)).slice(0, 50)
  }, [clientes.datos, buscar])
  const clienteSel = porId(clientes.datos).get(clienteId)

  function cambiarModalidad(m: Modalidad) {
    setModalidad(m)
    const dias = DURACION[m]
    if (dias && esFechaValida(desde)) setHasta(sumarDias(desde, dias - 1))
  }

  function cambiarDesde(f: string) {
    setDesde(f)
    const dias = DURACION[modalidad]
    if (dias && esFechaValida(f)) setHasta(sumarDias(f, dias - 1))
    else if (esFechaValida(f) && hasta < f) setHasta(f)
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const monto = leerPesos(precio)
    if (!nuevo && !clienteSel) return setError('Elegí un cliente o cargá uno nuevo.')
    if (nuevo && !nuevo.nombre.trim()) return setError('Falta el nombre del cliente nuevo.')
    if (!fechasOk) return setError('Revisá las fechas: "hasta" no puede ser anterior a "desde".')
    if (!unidadSel) return setError('Elegí la sombra.')
    // Sin las reservas cargadas no se puede saber si la sombra está libre.
    if (reservas.cargando) return setError('Todavía se están cargando las reservas, probá en un segundo.')
    if (choqueSel.length) return setError(`${unidadSel.codigo} ya está reservada en esas fechas.`)
    if (monto == null) return setError('El precio tiene que ser un número, en pesos.')
    if (reserva && pagosReserva.datos.length && temporada !== reserva.temporada) {
      return setError(`La reserva tiene pagos de la temporada ${reserva.temporada}: no se puede pasar a otra.`)
    }
    if (reserva && pagosReserva.datos.length && clienteId !== reserva.clienteId) {
      return setError('La reserva tiene pagos de este cliente: no se puede pasar a otro. Cancelala y cargá una nueva.')
    }

    const ok = await guardar(async () => {
      // Cliente nuevo y reserva van en un mismo lote: o se guardan los dos o
      // ninguno, también si se corta la señal a mitad de camino.
      const lote = writeBatch(db)
      let cId = clienteId
      let cNombre = clienteSel?.nombre ?? ''
      if (nuevo) {
        const ref = doc(C.clientes)
        const datos = { nombre: nuevo.nombre.trim(), telefono: nuevo.telefono.trim(), email: '', documento: '', notas: '' }
        lote.set(ref, conAuditoria(datos))
        cId = ref.id
        cNombre = datos.nombre
      }
      const datos = {
        unidadId: unidadSel.id, unidadCodigo: unidadSel.codigo, unidadTipo: unidadSel.tipo,
        clienteId: cId, clienteNombre: cNombre, desde, hasta, modalidad, temporada,
        precio: monto, estado: reserva?.estado === 'cancelada' ? 'cancelada' : estado, notas: notas.trim(),
      } satisfies Omit<Reserva, 'creado' | 'creadoPor'>
      if (reserva) {
        lote.update(doc(C.reservas, reserva.id), datos)
        // Los pagos guardan copia del código de la sombra.
        if (datos.unidadCodigo !== reserva.unidadCodigo) {
          for (const p of pagosReserva.datos) lote.update(doc(C.pagos, p.id), { unidadCodigo: datos.unidadCodigo })
        }
      } else {
        lote.set(doc(C.reservas), conAuditoria(datos))
      }
      await lote.commit()
    }, reserva ? 'Reserva actualizada.' : 'Reserva cargada.')
    if (ok) onCerrar()
  }

  const porTipo = new Map<TipoUnidad, typeof unidadesOrdenadas>()
  for (const u of unidadesOrdenadas) porTipo.set(u.tipo, [...(porTipo.get(u.tipo) ?? []), u])

  return (
    <Modal titulo={reserva ? `Editar reserva · ${reserva.unidadCodigo}` : 'Nueva reserva'} onCerrar={onCerrar} ancho={680}>
      <form onSubmit={enviar}>
        <div className="modal-cuerpo">
          <fieldset style={{ border: 0, display: 'grid', gap: 8 }}>
            <legend className="campo"><span>Cliente</span></legend>
            {nuevo ? (
              <div className="fila-campos">
                <Campo label="Nombre y apellido">
                  <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} maxLength={120} autoFocus />
                </Campo>
                <Campo label="Teléfono">
                  <input value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} inputMode="tel" maxLength={40} />
                </Campo>
              </div>
            ) : (
              <div className="fila-campos">
                <Campo label="Buscar">
                  <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre, teléfono o DNI" />
                </Campo>
                <Campo label="Elegir">
                  <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
                    <option value="">—</option>
                    {clienteSel && !clientesFiltrados.includes(clienteSel) && (
                      <option value={clienteSel.id}>{clienteSel.nombre}</option>
                    )}
                    {clientesFiltrados.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}{c.telefono ? ` · ${c.telefono}` : ''}</option>
                    ))}
                  </select>
                </Campo>
              </div>
            )}
            {!reserva && (
              <button type="button" className="btn btn-sec btn-chico" style={{ justifySelf: 'start' }}
                onClick={() => setNuevo(nuevo ? null : { nombre: buscar, telefono: '' })}>
                {nuevo ? 'Elegir uno existente' : '+ Cliente nuevo'}
              </button>
            )}
          </fieldset>

          <div className="fila-campos">
            <Campo label="Modalidad">
              <select value={modalidad} onChange={(e) => cambiarModalidad(e.target.value as Modalidad)}>
                {Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo label="Desde"><input type="date" value={desde} onChange={(e) => cambiarDesde(e.target.value)} required /></Campo>
            <Campo label="Hasta (inclusive)" ayuda={fechasOk ? `${plural(diasIncluidos(desde, hasta), 'día', 'días')} · temporada ${temporada}` : undefined}>
              <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} required />
            </Campo>
          </div>

          <Campo
            label="Sombra"
            ayuda={choqueSel.length
              ? undefined
              : fechasOk ? 'Las ocupadas en esas fechas aparecen deshabilitadas.' : undefined}
          >
            <select value={unidadId} onChange={(e) => setUnidadId(e.target.value)} required aria-invalid={choqueSel.length > 0}>
              <option value="">—</option>
              {[...porTipo].map(([tipo, us]) => (
                <optgroup key={tipo} label={TIPOS_UNIDAD[tipo]}>
                  {us.map((u) => {
                    const ch = choquesPorUnidad.get(u.id) ?? []
                    return (
                      <option key={u.id} value={u.id} disabled={ch.length > 0 && u.id !== unidadId}>
                        {u.codigo}{u.sector ? ` · ${u.sector}` : ''}{ch.length ? ` — ocupada (${ch[0]!.clienteNombre})` : ''}
                      </option>
                    )
                  })}
                </optgroup>
              ))}
            </select>
          </Campo>
          {choqueSel.length > 0 && (
            <p className="aviso">
              {unidadSel?.codigo} ya está reservada: {choqueSel.map((r) => `${r.clienteNombre} (${rango(r.desde, r.hasta)})`).join(', ')}.
            </p>
          )}
          {unidades.datos.length === 0 && !unidades.cargando && (
            <p className="nota">Todavía no hay sombras cargadas. Un administrador las carga en Ajustes → Sombras.</p>
          )}

          <div className="fila-campos">
            <Campo label="Precio total" ayuda={leerPesos(precio) != null ? pesos(leerPesos(precio)!) : 'En pesos, sin centavos'}>
              <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="numeric" required placeholder="0" />
            </Campo>
            {reserva?.estado !== 'cancelada' && (
              <Campo label="Estado">
                <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoReserva)}>
                  <option value="pendiente">{ESTADOS_RESERVA.pendiente}</option>
                  <option value="confirmada">{ESTADOS_RESERVA.confirmada}</option>
                </select>
              </Campo>
            )}
          </div>
          <Campo label="Notas"><textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={2000} /></Campo>
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
