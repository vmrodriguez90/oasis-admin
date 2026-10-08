import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { limit, orderBy, query } from 'firebase/firestore'
import { BarrasH, Columnas, Linea, Medidor } from '../components/graficos'
import { Cabecera, ErrorCarga, SelectorTemporada, Vacio } from '../components/ui'
import { C, q, useLista } from '../lib/db'
import { pesos, pesosCorto } from '../lib/dinero'
import {
  fechaCorta, fechaLarga, hoy, mayuscula, nombreMes, plural, temporadaAnterior, temporadaDe,
} from '../lib/fechas'
import { ORDEN_TIPOS, activa } from '../lib/reservas'
import {
  anticipacion, clientesQueVuelven, cobrosPorMetodo, duraciones, embudoConsultas, mejoresClientes, ocupacionDiaria,
  ocupacionPorTipo, resumenTemporada, ritmoDeVentas, ventasPorMes, ventasPorTipo,
} from '../lib/stats'
import { CANALES, METODOS_PAGO, TIPOS_UNIDAD, type TipoUnidad } from '../lib/types'
import { useTemporada } from '../sesion'

const ultimaImportacion = query(C.importaciones, orderBy('creado', 'desc'), limit(1))
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

export function Estadisticas() {
  const { temporada } = useTemporada()
  const dia = hoy()
  const actual = temporadaDe(dia)
  const anterior = temporadaAnterior(temporada)

  const unidades = useLista(C.unidades, 'unidades')
  const reservas = useLista(q.reservasDeTemporada(temporada), `reservas:${temporada}`)
  const previas = useLista(q.reservasDeTemporada(anterior), `reservas:${anterior}`)
  const pagos = useLista(q.pagosDeTemporada(temporada), `pagos:${temporada}`)
  const consultas = useLista(q.consultasDeTemporada(temporada), `consultas:${temporada}`)
  const importacion = useLista(ultimaImportacion, 'importacion-ultima')
  const [tipoElegido, setTipo] = useState<TipoUnidad>('carpa')

  const rs = reservas.datos
  const resumen = useMemo(() => resumenTemporada(rs, pagos.datos), [rs, pagos.datos])
  const ritmo = useMemo(
    () => (temporada >= actual ? ritmoDeVentas(rs, previas.datos, dia) : null),
    [rs, previas.datos, dia, temporada, actual],
  )
  const hoyPorTipo = useMemo(() => ocupacionPorTipo(unidades.datos, rs, dia), [unidades.datos, rs, dia])
  const tipos = useMemo(
    () => ORDEN_TIPOS.filter((t) => rs.some((r) => activa(r) && r.unidadTipo === t) && unidades.datos.some((u) => u.tipo === t)),
    [rs, unidades.datos],
  )
  const tipo = tipos.includes(tipoElegido) ? tipoElegido : tipos[0]
  const diaria = useMemo(() => (tipo ? ocupacionDiaria(unidades.datos, rs, tipo) : []), [unidades.datos, rs, tipo])
  const ventasMes = useMemo(() => ventasPorMes(rs), [rs])
  const porTipo = useMemo(() => ventasPorTipo(rs).filter((x) => x.monto > 0), [rs])
  const duracion = useMemo(() => duraciones(rs), [rs])
  const antic = useMemo(() => anticipacion(rs), [rs])
  // Los pases de un día se reservan sobre la hora y tiran la mediana a cero.
  const anticEstadias = useMemo(() => anticipacion(rs.filter((r) => r.desde !== r.hasta)), [rs])
  const hayPases = rs.some((r) => activa(r) && r.desde === r.hasta)
  const vuelven = useMemo(() => clientesQueVuelven(rs, previas.datos), [rs, previas.datos])
  const mejores = useMemo(() => mejoresClientes(rs), [rs])
  const metodos = useMemo(() => cobrosPorMetodo(pagos.datos), [pagos.datos])
  const embudo = useMemo(() => embudoConsultas(consultas.datos), [consultas.datos])

  const entran = rs.filter((r) => activa(r) && r.desde === dia)
  const salen = rs.filter((r) => activa(r) && r.hasta === dia)
  const hayPlaya = temporada === actual && (hoyPorTipo.some((o) => o.ocupadas > 0) || entran.length > 0 || salen.length > 0)

  const pico = diaria.reduce<(typeof diaria)[number] | null>((m, d) => (!m || d.ocupadas > m.ocupadas ? d : m), null)
  const promedio = diaria.length ? Math.round(diaria.reduce((n, d) => n + pct(d.ocupadas, d.total), 0) / diaria.length) : 0
  const ult = importacion.datos[0]

  if (!reservas.cargando && rs.length === 0) {
    return (
      <>
        <Cabecera titulo="Estadísticas" sub={`Temporada ${temporada}`}><SelectorTemporada /></Cabecera>
        <div className="tarjeta">
          <Vacio titulo={`Todavía no hay reservas de la temporada ${temporada}`}>
            Importá el archivo del sistema de reservas en Ajustes → Importar, o elegí otra temporada.
          </Vacio>
        </div>
      </>
    )
  }

  return (
    <>
      <Cabecera
        titulo="Estadísticas"
        sub={
          <>
            Temporada {temporada}
            {ult?.creado && ` · datos del sistema de reservas al ${ult.creado.toDate().toLocaleDateString('es-AR')}`}
          </>
        }
      >
        <SelectorTemporada />
      </Cabecera>
      <ErrorCarga error={reservas.error ?? pagos.error ?? unidades.error} />

      <div className="grilla g-4" style={{ marginBottom: 16 }}>
        <div className="tarjeta ancho-2">
          <div className="cifra-label">Vendido en la temporada</div>
          <div className="cifra-heroe">{pesos(resumen.vendido)}</div>
          <div className="cifra-sub">
            {plural(resumen.reservas, 'reserva', 'reservas')} · {plural(resumen.canceladas, 'cancelada', 'canceladas')}
            {resumen.sinImporte > 0 && ` · ${resumen.sinImporte} sin importe cargado`}
          </div>
          {ritmo && (
            <div className="cifra-sub" style={{ marginTop: 6 }}>
              A esta altura de la temporada pasada: {pesos(ritmo.anterior)}{' '}
              <b>({ritmo.actual >= ritmo.anterior ? '+' : '−'}{Math.abs(pct(ritmo.actual - ritmo.anterior, ritmo.anterior))}%)</b>
            </div>
          )}
        </div>
        <div className="tarjeta">
          <div className="cifra-label">Cobrado</div>
          <div className="cifra">{pesos(resumen.cobrado)}</div>
          <div className="cifra-sub">{pct(resumen.cobrado, resumen.vendido)}% de lo vendido</div>
        </div>
        <div className="tarjeta">
          <div className="cifra-label">Falta cobrar</div>
          <div className={resumen.pendiente > 0 ? 'cifra deuda' : 'cifra'}>{pesos(resumen.pendiente)}</div>
          <div className="cifra-sub">{plural(resumen.conDeuda, 'reserva', 'reservas')} con saldo</div>
        </div>
      </div>

      {hayPlaya && (
        <section className="tarjeta" style={{ marginBottom: 16 }}>
          <h2>Hoy en la playa</h2>
          <p className="sub">{mayuscula(fechaLarga(dia))}</p>
          <div className="grilla g-4">
            {hoyPorTipo.map((o) => (
              <div key={o.tipo}>
                <div className="cifra-label">{TIPOS_UNIDAD[o.tipo]}s ocupadas</div>
                <div className="cifra">{o.ocupadas} <span className="secundario" style={{ fontSize: 16, fontWeight: 400 }}>de {o.total}</span></div>
                <Medidor valor={o.ocupadas} total={o.total} />
              </div>
            ))}
          </div>
          {(entran.length > 0 || salen.length > 0) && (
            <div className="grilla g-2" style={{ marginTop: 18 }}>
              <div>
                <div className="cifra-label">Empiezan hoy · {entran.length}</div>
                <p style={{ fontSize: 14 }}>{entran.map((r) => `${r.unidadCodigo} ${r.clienteNombre}`).join(' · ') || '—'}</p>
              </div>
              <div>
                <div className="cifra-label">Terminan hoy · {salen.length}</div>
                <p style={{ fontSize: 14 }}>{salen.map((r) => `${r.unidadCodigo} ${r.clienteNombre}`).join(' · ') || '—'}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {tipo && diaria.length > 0 && (
        <section className="tarjeta" style={{ marginBottom: 16 }}>
          <div className="tarjeta-cab" style={{ flexWrap: 'wrap' }}>
            <div>
              <h2>Ocupación diaria</h2>
              <p className="sub">
                {TIPOS_UNIDAD[tipo]}s con reserva cada día, de {plural(diaria[0]!.total, 'unidad', 'unidades')} · promedio {promedio}%
                {pico && ` · pico ${pct(pico.ocupadas, pico.total)}% el ${fechaCorta(pico.dia)}`}
              </p>
            </div>
            {tipos.length > 1 && (
              <div className="pestanas" role="group" aria-label="Tipo de unidad">
                {tipos.map((t) => (
                  <button type="button" key={t} aria-pressed={t === tipo} onClick={() => setTipo(t)}>{TIPOS_UNIDAD[t]}s</button>
                ))}
              </div>
            )}
          </div>
          <Linea
            titulo={`Ocupación diaria de ${TIPOS_UNIDAD[tipo].toLowerCase()}s`}
            datos={diaria.map((d) => ({
              dia: d.dia,
              valor: pct(d.ocupadas, d.total),
              detalle: `${fechaCorta(d.dia)} · ${d.ocupadas} de ${d.total}`,
            }))}
            formato={(n) => `${n}%`}
            maximo={100}
            marca={dia}
            rotuloEje={(f) => (f.endsWith('-01') || f === diaria[0]!.dia ? (f.endsWith('-01') ? nombreMes(f.slice(0, 7)) : fechaCorta(f)) : null)}
          />
        </section>
      )}

      <div className="grilla g-2" style={{ marginBottom: 16 }}>
        <section className="tarjeta">
          <h2>Ventas por mes</h2>
          <p className="sub">Importe de las reservas según el mes en que se hicieron</p>
          {ventasMes.length === 0 ? <p className="secundario">Sin fechas de reserva.</p> : (
            <Columnas
              titulo="Ventas por mes"
              datos={ventasMes.map((m) => ({
                etiqueta: nombreMes(m.mes),
                valor: m.monto,
                detalle: `${nombreMes(m.mes)} ${m.mes.slice(0, 4)} · ${plural(m.reservas, 'reserva', 'reservas')}`,
              }))}
              formato={pesos}
              formatoEje={pesosCorto}
            />
          )}
        </section>
        <section className="tarjeta">
          <h2>Ventas por tipo de unidad</h2>
          <p className="sub">El importe de cada reserva cuenta en su unidad principal</p>
          <BarrasH
            datos={porTipo.map((x) => ({
              etiqueta: `${TIPOS_UNIDAD[x.tipo]}s`,
              valor: x.monto,
              detalle: `${plural(x.unidades, 'unidad reservada', 'unidades reservadas')}`,
            }))}
            formato={pesosCorto}
          />
          <p className="secundario" style={{ marginTop: 14 }}>
            Promedio por reserva: {pesos(resumen.reservas ? Math.round(resumen.vendido / resumen.reservas) : 0)}
          </p>
        </section>
      </div>

      <div className="grilla g-2" style={{ marginBottom: 16 }}>
        <section className="tarjeta">
          <h2>Duración de las reservas</h2>
          <p className="sub">Cuántos días se quedan</p>
          <BarrasH datos={duracion.map((d) => ({ etiqueta: d.rango, valor: d.reservas }))} formato={(n) => n.toLocaleString('es-AR')} />
        </section>
        <section className="tarjeta">
          <h2>Anticipación</h2>
          <p className="sub">Cuánto antes de llegar se hace la reserva</p>
          {antic.mediana == null ? <p className="secundario">Sin fechas de reserva.</p> : (
            <>
              <div className="cifra">{antic.mediana === 0 ? 'El mismo día' : plural(antic.mediana, 'día', 'días')}</div>
              <div className="cifra-sub">
                {antic.mediana === 0
                  ? 'la mitad de las reservas se hace el día que empieza'
                  : `la mitad de las reservas se hace con menos de ${plural(antic.mediana, 'día', 'días')} de anticipación`}
              </div>
              {hayPases && anticEstadias.mediana != null && (
                <div className="cifra-sub">
                  Sin contar los pases de un día: {anticEstadias.mediana === 0 ? 'el mismo día' : plural(anticEstadias.mediana, 'día', 'días')}
                </div>
              )}
              <div style={{ height: 14 }} />
              <BarrasH datos={antic.rangos.map((d) => ({ etiqueta: d.rango, valor: d.reservas }))} formato={(n) => n.toLocaleString('es-AR')} />
            </>
          )}
        </section>
      </div>

      <div className="grilla g-2" style={{ marginBottom: 16, alignItems: 'start' }}>
        <section className="tarjeta">
          <h2>Clientes</h2>
          <p className="sub">Con alguna reserva activa en la temporada</p>
          <div className="grilla" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginBottom: 16 }}>
            <div><div className="cifra-label">Clientes</div><div className="cifra">{vuelven.clientes.toLocaleString('es-AR')}</div></div>
            {previas.datos.length > 0 && (
              <div>
                <div className="cifra-label">Vuelven de {anterior}</div>
                <div className="cifra">{pct(vuelven.vuelven, vuelven.clientes)}%</div>
                <div className="cifra-sub">{plural(vuelven.vuelven, 'cliente', 'clientes')}</div>
              </div>
            )}
          </div>
          <div className="cifra-label" style={{ marginBottom: 4 }}>Los que más compraron</div>
          <table>
            <tbody>
              {mejores.map((c) => (
                <tr key={c.clienteId}>
                  <td>
                    <Link to={`/clientes/${c.clienteId}`}>{c.clienteNombre}</Link>
                    <div className="secundario">{plural(c.reservas, 'reserva', 'reservas')}</div>
                  </td>
                  <td className="num">{pesos(c.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="tarjeta">
          <h2>Consultas</h2>
          <p className="sub">Recibidas en la temporada</p>
          {consultas.datos.length === 0 ? (
            <p className="secundario">Todavía no se cargaron consultas de esta temporada.</p>
          ) : (
            <>
              <div className="grilla" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 16 }}>
                <div><div className="cifra-label">Abiertas</div><div className="cifra">{embudo.abiertas}</div></div>
                <div><div className="cifra-label">Ganadas</div><div className="cifra">{embudo.ganadas}</div></div>
                <div>
                  <div className="cifra-label">Conversión</div>
                  <div className="cifra">{embudo.conversion == null ? '—' : `${Math.round(embudo.conversion * 100)}%`}</div>
                  <div className="cifra-sub">de las cerradas</div>
                </div>
              </div>
              <BarrasH datos={embudo.porCanal.map((c) => ({ etiqueta: CANALES[c.canal], valor: c.total }))} formato={String} />
            </>
          )}
        </section>
      </div>

      {metodos.length > 0 && (
        <section className="tarjeta">
          <h2>Cobros cargados en el admin, por medio de pago</h2>
          <p className="sub">Los cobros de las reservas importadas están en el sistema de reservas</p>
          <BarrasH datos={metodos.map((m) => ({ etiqueta: METODOS_PAGO[m.metodo], valor: m.monto }))} formato={pesosCorto} />
        </section>
      )}
    </>
  )
}
