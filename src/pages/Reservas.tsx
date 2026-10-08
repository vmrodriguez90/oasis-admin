import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react'
import { ReservaDetalle } from '../components/ReservaDetalle'
import { ReservaForm, type Prellenado } from '../components/ReservaForm'
import { Cabecera, ErrorCarga, Etiqueta, SelectorTemporada, Vacio } from '../components/ui'
import { aCSV, descargar } from '../lib/csv'
import { C, q, useLista } from '../lib/db'
import { pesos } from '../lib/dinero'
import { esFechaValida, fechaCorta, fechaLarga, hoy, mayuscula, plural, rango, sumarDias, temporadaDe } from '../lib/fechas'
import { puedeEditar } from '../lib/permisos'
import { activa, claveReserva, ocupacionDelDia, ordenarUnidades, pagadoDe, pagadoPorReserva, saldo } from '../lib/reservas'
import { ESTADOS_RESERVA, MODALIDADES, TIPOS_UNIDAD, type TipoUnidad } from '../lib/types'
import { useTemporada, useUsuario } from '../sesion'

type Filtro = 'activas' | 'pendiente' | 'deuda' | 'cancelada' | 'todas'
const FILTROS: Record<Filtro, string> = {
  activas: 'Activas', pendiente: 'Pendientes', deuda: 'Con saldo', cancelada: 'Canceladas', todas: 'Todas',
}

export function Reservas() {
  const yo = useUsuario()
  const edita = puedeEditar(yo.rol)
  const { temporada } = useTemporada()
  const [dia, setDia] = useState(hoy())
  const [filtro, setFiltro] = useState<Filtro>('activas')
  const [buscar, setBuscar] = useState('')
  const [nueva, setNueva] = useState<Prellenado | null>(null)
  const [verId, setVerId] = useState<string | null>(null)

  const unidades = useLista(C.unidades, 'unidades')
  const tDia = temporadaDe(dia)
  const reservasDia = useLista(q.reservasDeTemporada(tDia), `reservas:${tDia}`)
  const reservas = useLista(q.reservasDeTemporada(temporada), `reservas:${temporada}`)
  const pagos = useLista(q.pagosDeTemporada(temporada), `pagos:${temporada}`)

  const ocupacion = useMemo(() => ocupacionDelDia(reservasDia.datos, dia), [reservasDia.datos, dia])
  const grupos = useMemo(() => {
    const m = new Map<TipoUnidad, typeof unidades.datos>()
    for (const u of ordenarUnidades(unidades.datos.filter((u) => u.activa))) m.set(u.tipo, [...(m.get(u.tipo) ?? []), u])
    return [...m]
  }, [unidades.datos])
  const libres = grupos.reduce((n, [, us]) => n + us.filter((u) => !ocupacion.has(u.id)).length, 0)

  const pagado = useMemo(() => pagadoPorReserva(pagos.datos), [pagos.datos])
  const filas = useMemo(() => {
    const t = buscar.trim().toLowerCase()
    return reservas.datos
      .map((r) => {
        const p = pagadoDe(r, pagado)
        return { ...r, pagado: p, saldo: saldo(r, p) }
      })
      .filter((r) => {
        if (filtro === 'activas' && !activa(r)) return false
        if (filtro === 'pendiente' && r.estado !== 'pendiente') return false
        if (filtro === 'cancelada' && r.estado !== 'cancelada') return false
        if (filtro === 'deuda' && r.saldo <= 0) return false
        return !t || `${r.clienteNombre} ${r.unidadCodigo} ${r.externoId ?? ''}`.toLowerCase().includes(t)
      })
      .sort((a, b) => a.desde.localeCompare(b.desde) || a.unidadCodigo.localeCompare(b.unidadCodigo, 'es', { numeric: true }))
  }, [reservas.datos, pagado, filtro, buscar])

  function exportar() {
    descargar(`reservas-${temporada.replace('/', '-')}.csv`, aCSV(
      filas.map((r) => ({ ...r, tipo: TIPOS_UNIDAD[r.unidadTipo], modalidad: MODALIDADES[r.modalidad], estado: ESTADOS_RESERVA[r.estado] })),
      [['externoId', 'Nº sistema'], ['unidadCodigo', 'Unidad'], ['tipo', 'Tipo'], ['clienteNombre', 'Cliente'], ['desde', 'Desde'], ['hasta', 'Hasta'],
        ['modalidad', 'Modalidad'], ['precio', 'Precio'], ['pagado', 'Pagado'], ['saldo', 'Saldo'], ['estado', 'Estado'], ['notas', 'Notas']],
    ))
  }

  return (
    <>
      <Cabecera titulo="Reservas" sub={`Temporada ${temporada}`}>
        <SelectorTemporada />
        {edita && <button type="button" className="btn" onClick={() => setNueva({ desde: dia })}><Plus size={17} />Nueva reserva</button>}
      </Cabecera>

      <section className="tarjeta" style={{ marginBottom: 24 }}>
        <div className="tarjeta-cab" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h2>Mapa del día</h2>
            <p className="sub" style={{ marginBottom: 0 }}>
              {mayuscula(fechaLarga(dia))}{dia === hoy() ? ' · hoy' : ''} · {plural(libres, 'libre', 'libres')}
            </p>
          </div>
          <div className="acciones">
            <button type="button" className="btn btn-sec btn-icono" aria-label="Día anterior" onClick={() => setDia(sumarDias(dia, -1))}><ChevronLeft size={18} /></button>
            <input type="date" className="input" style={{ width: 'auto' }} value={dia} aria-label="Día"
              onChange={(e) => esFechaValida(e.target.value) && setDia(e.target.value)} />
            <button type="button" className="btn btn-sec btn-icono" aria-label="Día siguiente" onClick={() => setDia(sumarDias(dia, 1))}><ChevronRight size={18} /></button>
            {dia !== hoy() && <button type="button" className="btn btn-sec" onClick={() => setDia(hoy())}>Hoy</button>}
          </div>
        </div>
        <ErrorCarga error={unidades.error ?? reservasDia.error} />
        {grupos.length === 0 && !unidades.cargando ? (
          <Vacio titulo="No hay unidades cargadas">
            {yo.rol === 'admin' ? 'Importá el archivo del sistema de reservas o cargalas en Ajustes → Unidades.' : 'Pedile a un administrador que las cargue.'}
          </Vacio>
        ) : (
          <>
            {grupos.map(([tipo, us]) => (
              <div className="mapa-grupo" key={tipo}>
                <h3>{TIPOS_UNIDAD[tipo]}s · {us.filter((u) => !ocupacion.has(u.id)).length} de {us.length} libres</h3>
                <div className="mapa">
                  {us.map((u) => {
                    const r = ocupacion.get(u.id)
                    const clase = r ? (r.estado === 'confirmada' ? 'celda ocupada' : 'celda pendiente') : 'celda'
                    return (
                      <button
                        type="button" key={u.id} className={clase}
                        disabled={!r && !edita}
                        onClick={() => (r ? setVerId(r.id) : setNueva({ unidadId: u.id, desde: dia }))}
                        aria-label={r ? `${u.codigo}: ${r.clienteNombre}, ${ESTADOS_RESERVA[r.estado]}` : `${u.codigo}: libre`}
                      >
                        <b>{u.codigo}</b>
                        <span>{r ? r.clienteNombre : 'Libre'}</span>
                        {r && <span>{r.estado === 'pendiente' ? 'Pendiente · ' : ''}hasta {fechaCorta(r.hasta)}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="leyenda" style={{ marginTop: 16 }}>
              <span><i className="l-ocupada" />Confirmada</span>
              <span><i className="l-pendiente" />Pendiente</span>
              <span><i className="l-libre" />Libre{edita ? ' (tocá para reservar)' : ''}</span>
            </div>
          </>
        )}
      </section>

      <div className="filtros">
        <div className="pestanas" role="group" aria-label="Filtrar reservas">
          {(Object.keys(FILTROS) as Filtro[]).map((f) => (
            <button type="button" key={f} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{FILTROS[f]}</button>
          ))}
        </div>
        <input className="input buscar" type="search" placeholder="Buscar cliente, unidad o nº de reserva" value={buscar}
          onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar" />
        <button type="button" className="btn btn-sec" onClick={exportar} disabled={!filas.length}><Download size={16} />CSV</button>
      </div>

      <ErrorCarga error={reservas.error ?? pagos.error} />
      <div className="tabla-envoltorio">
        {filas.length === 0 ? (
          <Vacio titulo={reservas.cargando ? 'Cargando…' : 'No hay reservas con este filtro'} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Unidad</th><th>Cliente</th><th className="ocultar-movil">Fechas</th><th className="ocultar-movil">Modalidad</th>
                <th className="num ocultar-movil">Precio</th><th className="num">Saldo</th><th className="ocultar-movil">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.id} className="clic" onClick={() => setVerId(r.id)} tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setVerId(r.id)}>
                  <td><b>{r.unidadCodigo}</b></td>
                  <td>
                    {r.clienteNombre}
                    <div className="secundario solo-movil">
                      {rango(r.desde, r.hasta)} <Etiqueta clase={r.estado}>{ESTADOS_RESERVA[r.estado]}</Etiqueta>
                    </div>
                  </td>
                  <td className="ocultar-movil" style={{ whiteSpace: 'nowrap' }}>{rango(r.desde, r.hasta)}</td>
                  <td className="ocultar-movil">{MODALIDADES[r.modalidad]}</td>
                  <td className="num ocultar-movil">{pesos(r.precio)}</td>
                  <td className={r.saldo > 0 ? 'num deuda' : 'num'}>{r.saldo > 0 ? pesos(r.saldo) : '—'}</td>
                  <td className="ocultar-movil"><Etiqueta clase={r.estado}>{ESTADOS_RESERVA[r.estado]}</Etiqueta></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{plural(new Set(filas.map(claveReserva)).size, 'reserva', 'reservas')}</td>
                <td className="ocultar-movil" />
                <td className="ocultar-movil" />
                <td className="num ocultar-movil">{pesos(filas.filter(activa).reduce((n, r) => n + r.precio, 0))}</td>
                <td className="num">{pesos(filas.reduce((n, r) => n + r.saldo, 0))}</td>
                <td className="ocultar-movil" />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {nueva && <ReservaForm prellenado={nueva} onCerrar={() => setNueva(null)} />}
      {verId && <ReservaDetalle id={verId} onCerrar={() => setVerId(null)} />}
    </>
  )
}
