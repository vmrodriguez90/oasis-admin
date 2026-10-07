import { useMemo } from 'react'
import { BarrasH, Columnas, Medidor } from '../components/graficos'
import { Cabecera, ErrorCarga, SelectorTemporada } from '../components/ui'
import { C, q, useLista } from '../lib/db'
import { pesos, pesosCorto } from '../lib/dinero'
import { fechaCorta, fechaLarga, hoy, mayuscula, nombreMes, plural, temporadaDe } from '../lib/fechas'
import { activa } from '../lib/reservas'
import {
  cobrosPorMes, cobrosPorMetodo, embudoConsultas, ocupacionPorTipo, ocupacionProximosDias, resumenTemporada,
} from '../lib/stats'
import { CANALES, METODOS_PAGO, TIPOS_UNIDAD } from '../lib/types'
import { useTemporada } from '../sesion'

export function Estadisticas() {
  const { temporada } = useTemporada()
  const dia = hoy()
  const esActual = temporada === temporadaDe(dia)

  const unidades = useLista(C.unidades, 'unidades')
  const reservas = useLista(q.reservasDeTemporada(temporada), `reservas:${temporada}`)
  const pagos = useLista(q.pagosDeTemporada(temporada), `pagos:${temporada}`)
  const consultas = useLista(q.consultasDeTemporada(temporada), `consultas:${temporada}`)

  const resumen = useMemo(() => resumenTemporada(reservas.datos, pagos.datos), [reservas.datos, pagos.datos])
  const meses = useMemo(() => cobrosPorMes(pagos.datos, temporada), [pagos.datos, temporada])
  const metodos = useMemo(() => cobrosPorMetodo(pagos.datos), [pagos.datos])
  const hoyPorTipo = useMemo(() => ocupacionPorTipo(unidades.datos, reservas.datos, dia), [unidades.datos, reservas.datos, dia])
  const proximos = useMemo(() => ocupacionProximosDias(unidades.datos, reservas.datos, dia, 14), [unidades.datos, reservas.datos, dia])
  const embudo = useMemo(() => embudoConsultas(consultas.datos), [consultas.datos])

  const entran = reservas.datos.filter((r) => activa(r) && r.desde === dia)
  const salen = reservas.datos.filter((r) => activa(r) && r.hasta === dia)
  const pctCobrado = resumen.facturado > 0 ? Math.round((resumen.cobrado / resumen.facturado) * 100) : null

  return (
    <>
      <Cabecera titulo="Estadísticas" sub={`Temporada ${temporada}`}>
        <SelectorTemporada />
      </Cabecera>
      <ErrorCarga error={reservas.error ?? pagos.error ?? unidades.error} />

      <div className="grilla g-4" style={{ marginBottom: 16 }}>
        <div className="tarjeta" style={{ gridColumn: 'span 2' }}>
          <div className="cifra-label">Cobrado en la temporada</div>
          <div className="cifra-heroe">{pesos(resumen.cobrado)}</div>
          <div className="cifra-sub">
            {pctCobrado != null ? `${pctCobrado}% de ${pesos(resumen.facturado)} en reservas` : 'Sin reservas todavía'}
          </div>
        </div>
        <div className="tarjeta">
          <div className="cifra-label">Falta cobrar</div>
          <div className={resumen.pendiente > 0 ? 'cifra deuda' : 'cifra'}>{pesos(resumen.pendiente)}</div>
          <div className="cifra-sub">{plural(resumen.conDeuda, 'reserva', 'reservas')} con saldo</div>
        </div>
        <div className="tarjeta">
          <div className="cifra-label">Reservas activas</div>
          <div className="cifra">{resumen.reservas}</div>
          <div className="cifra-sub">{plural(reservas.datos.length - resumen.reservas, 'cancelada', 'canceladas')}</div>
        </div>
      </div>

      {esActual && (
        <section className="tarjeta" style={{ marginBottom: 16 }}>
          <h2>Hoy en la playa</h2>
          <p className="sub">{mayuscula(fechaLarga(dia))}</p>
          {hoyPorTipo.length === 0 ? (
            <p className="secundario">Cargá las sombras en Ajustes → Sombras para ver la ocupación.</p>
          ) : (
            <div className="grilla g-3">
              {hoyPorTipo.map((o) => (
                <div key={o.tipo}>
                  <div className="cifra-label">{TIPOS_UNIDAD[o.tipo]}s ocupadas</div>
                  <div className="cifra">{o.ocupadas} <span className="secundario" style={{ fontSize: 16, fontWeight: 400 }}>de {o.total}</span></div>
                  <Medidor valor={o.ocupadas} total={o.total} />
                </div>
              ))}
            </div>
          )}
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

      <div className={esActual ? 'grilla g-2' : 'grilla'} style={{ marginBottom: 16 }}>
        <section className="tarjeta">
          <h2>Cobros por mes</h2>
          <p className="sub">Por fecha de cobro, de julio a junio</p>
          <Columnas
            titulo="Cobros por mes"
            datos={meses.map((m) => ({ etiqueta: nombreMes(m.mes), valor: m.monto, detalle: `${nombreMes(m.mes)} ${m.mes.slice(0, 4)}` }))}
            formato={pesos}
            formatoEje={pesosCorto}
          />
        </section>
        {esActual && (
          <section className="tarjeta">
            <h2>Ocupación de los próximos 14 días</h2>
            <p className="sub">Porcentaje de sombras activas con reserva</p>
            <Columnas
              titulo="Ocupación de los próximos 14 días"
              datos={proximos.map((p) => ({
                etiqueta: fechaCorta(p.dia).split(' ')[0]!,
                valor: p.total ? Math.round((p.ocupadas / p.total) * 100) : 0,
                detalle: `${fechaCorta(p.dia)} · ${p.ocupadas} de ${p.total}`,
              }))}
              formato={(n) => `${n}%`}
              maximo={100}
            />
          </section>
        )}
      </div>

      <div className="grilla g-2">
        <section className="tarjeta">
          <h2>Cobros por medio de pago</h2>
          <p className="sub">Total de la temporada</p>
          {metodos.length === 0 ? <p className="secundario">Sin cobros todavía.</p> : (
            <BarrasH datos={metodos.map((m) => ({ etiqueta: METODOS_PAGO[m.metodo], valor: m.monto }))} formato={pesosCorto} />
          )}
        </section>
        <section className="tarjeta">
          <h2>Consultas</h2>
          <p className="sub">Recibidas en la temporada</p>
          <div className="grilla" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 16 }}>
            <div><div className="cifra-label">Abiertas</div><div className="cifra">{embudo.abiertas}</div></div>
            <div><div className="cifra-label">Ganadas</div><div className="cifra">{embudo.ganadas}</div></div>
            <div>
              <div className="cifra-label">Conversión</div>
              <div className="cifra">{embudo.conversion == null ? '—' : `${Math.round(embudo.conversion * 100)}%`}</div>
              <div className="cifra-sub">de las cerradas</div>
            </div>
          </div>
          {embudo.porCanal.length > 0 && (
            <BarrasH datos={embudo.porCanal.map((c) => ({ etiqueta: CANALES[c.canal], valor: c.total }))} formato={String} />
          )}
        </section>
      </div>
    </>
  )
}
