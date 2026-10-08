import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { ReservaDetalle } from '../components/ReservaDetalle'
import { Cabecera, ErrorCarga, SelectorTemporada, Vacio } from '../components/ui'
import { aCSV, descargar } from '../lib/csv'
import { q, useLista } from '../lib/db'
import { pesos } from '../lib/dinero'
import { fechaCorta, mesesDeTemporada, nombreMes, plural } from '../lib/fechas'
import { METODOS_PAGO, type MetodoPago } from '../lib/types'
import { useTemporada } from '../sesion'

export function Pagos() {
  const { temporada } = useTemporada()
  const pagos = useLista(q.pagosDeTemporada(temporada), `pagos:${temporada}`)
  const [mes, setMes] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago | ''>('')
  const [buscar, setBuscar] = useState('')
  const [verId, setVerId] = useState<string | null>(null)

  const meses = useMemo(() => {
    const con = new Set(pagos.datos.map((p) => p.fecha.slice(0, 7)))
    return mesesDeTemporada(temporada).filter((m) => con.has(m))
  }, [pagos.datos, temporada])

  const filas = useMemo(() => {
    const t = buscar.trim().toLowerCase()
    return pagos.datos
      .filter((p) => (!mes || p.fecha.startsWith(mes)) && (!metodo || p.metodo === metodo))
      .filter((p) => !t || `${p.clienteNombre} ${p.unidadCodigo} ${p.nota}`.toLowerCase().includes(t))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado?.toMillis() ?? 0) - (a.creado?.toMillis() ?? 0))
  }, [pagos.datos, mes, metodo, buscar])

  const total = filas.reduce((n, p) => n + p.monto, 0)
  const porMetodo = (Object.keys(METODOS_PAGO) as MetodoPago[])
    .map((m) => ({ m, monto: filas.filter((p) => p.metodo === m).reduce((n, p) => n + p.monto, 0) }))
    .filter((x) => x.monto > 0)

  function exportar() {
    descargar(`pagos-${temporada.replace('/', '-')}${mes ? `-${mes}` : ''}.csv`, aCSV(
      filas.map((p) => ({ ...p, metodo: METODOS_PAGO[p.metodo] })),
      [['fecha', 'Fecha'], ['clienteNombre', 'Cliente'], ['unidadCodigo', 'Unidad'], ['metodo', 'Medio'],
        ['monto', 'Monto'], ['nota', 'Nota'], ['creadoPor', 'Cargado por']],
    ))
  }

  return (
    <>
      <Cabecera titulo="Pagos" sub="Los pagos se cargan desde cada reserva.">
        <SelectorTemporada />
      </Cabecera>

      <div className="grilla g-4" style={{ marginBottom: 20 }}>
        <div className="tarjeta">
          <div className="cifra-label">{mes ? `Cobrado en ${nombreMes(mes)}` : 'Cobrado en la temporada'}</div>
          <div className="cifra">{pesos(total)}</div>
          <div className="cifra-sub">{plural(filas.length, 'pago', 'pagos')}</div>
        </div>
        {porMetodo.slice(0, 3).map((x) => (
          <div className="tarjeta" key={x.m}>
            <div className="cifra-label">{METODOS_PAGO[x.m]}</div>
            <div className="cifra">{pesos(x.monto)}</div>
            <div className="cifra-sub">{total ? Math.round((x.monto / total) * 100) : 0}% del total</div>
          </div>
        ))}
      </div>

      <div className="filtros">
        <select className="input" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mes">
          <option value="">Todos los meses</option>
          {meses.map((m) => <option key={m} value={m}>{nombreMes(m)} {m.slice(0, 4)}</option>)}
        </select>
        <select className="input" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago | '')} aria-label="Medio de pago">
          <option value="">Todos los medios</option>
          {Object.entries(METODOS_PAGO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="input buscar" type="search" placeholder="Buscar cliente, unidad o nota" value={buscar}
          onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar" />
        <button type="button" className="btn btn-sec" onClick={exportar} disabled={!filas.length}><Download size={16} />CSV</button>
      </div>

      <ErrorCarga error={pagos.error} />
      <div className="tabla-envoltorio">
        {filas.length === 0 ? (
          <Vacio titulo={pagos.cargando ? 'Cargando…' : 'No hay pagos con este filtro'}>
            Para cobrar, abrí la reserva y tocá «Registrar pago».
          </Vacio>
        ) : (
          <table>
            <thead>
              <tr><th>Fecha</th><th>Cliente</th><th>Unidad</th><th className="ocultar-movil">Medio</th>
                <th className="num">Monto</th><th className="ocultar-movil">Cargado por</th></tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id} className="clic" tabIndex={0} onClick={() => setVerId(p.reservaId)}
                  onKeyDown={(e) => e.key === 'Enter' && setVerId(p.reservaId)}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(p.fecha)}</td>
                  <td>{p.clienteNombre}{p.nota && <div className="secundario">{p.nota}</div>}</td>
                  <td>{p.unidadCodigo}</td>
                  <td className="ocultar-movil">{METODOS_PAGO[p.metodo]}</td>
                  <td className="num">{pesos(p.monto)}</td>
                  <td className="ocultar-movil secundario">{p.creadoPor}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={3}>Total</td><td className="ocultar-movil" /><td className="num">{pesos(total)}</td><td className="ocultar-movil" /></tr>
            </tfoot>
          </table>
        )}
      </div>

      {verId && <ReservaDetalle id={verId} onCerrar={() => setVerId(null)} />}
    </>
  )
}
