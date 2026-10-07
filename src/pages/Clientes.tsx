import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Plus } from 'lucide-react'
import { ClienteForm } from '../components/ClienteForm'
import { Cabecera, ErrorCarga, SelectorTemporada, Vacio } from '../components/ui'
import { aCSV, descargar } from '../lib/csv'
import { C, q, useLista } from '../lib/db'
import { pesos } from '../lib/dinero'
import { puedeEditar } from '../lib/permisos'
import { activa, pagadoPorReserva, saldo } from '../lib/reservas'
import { useTemporada, useUsuario } from '../sesion'

export function Clientes() {
  const yo = useUsuario()
  const { temporada } = useTemporada()
  const navegar = useNavigate()
  const [buscar, setBuscar] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [soloDeuda, setSoloDeuda] = useState(false)

  const clientes = useLista(C.clientes, 'clientes')
  const reservas = useLista(q.reservasDeTemporada(temporada), `reservas:${temporada}`)
  const pagos = useLista(q.pagosDeTemporada(temporada), `pagos:${temporada}`)

  const porCliente = useMemo(() => {
    const pagado = pagadoPorReserva(pagos.datos)
    const m = new Map<string, { reservas: number; saldo: number; sombras: string[] }>()
    for (const r of reservas.datos.filter(activa)) {
      const x = m.get(r.clienteId) ?? { reservas: 0, saldo: 0, sombras: [] }
      x.reservas++
      x.saldo += saldo(r, pagado.get(r.id) ?? 0)
      if (!x.sombras.includes(r.unidadCodigo)) x.sombras.push(r.unidadCodigo)
      m.set(r.clienteId, x)
    }
    return m
  }, [reservas.datos, pagos.datos])

  const filas = useMemo(() => {
    const t = buscar.trim().toLowerCase()
    return clientes.datos
      .map((c) => ({ ...c, ...(porCliente.get(c.id) ?? { reservas: 0, saldo: 0, sombras: [] }) }))
      .filter((c) => (!soloDeuda || c.saldo > 0) && (!t || `${c.nombre} ${c.telefono} ${c.email} ${c.documento}`.toLowerCase().includes(t)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [clientes.datos, porCliente, buscar, soloDeuda])

  function exportar() {
    descargar('clientes.csv', aCSV(
      filas.map((c) => ({ ...c, sombras: c.sombras.join(' ') })),
      [['nombre', 'Nombre'], ['telefono', 'Teléfono'], ['email', 'Email'], ['documento', 'DNI'],
        ['reservas', `Reservas ${temporada}`], ['sombras', 'Sombras'], ['saldo', 'Saldo'], ['notas', 'Notas']],
    ))
  }

  return (
    <>
      <Cabecera titulo="Clientes" sub={`${clientes.datos.length} en total · reservas y saldos de la temporada ${temporada}`}>
        <SelectorTemporada />
        {puedeEditar(yo.rol) && <button type="button" className="btn" onClick={() => setNuevo(true)}><Plus size={17} />Nuevo cliente</button>}
      </Cabecera>

      <div className="filtros">
        <input className="input buscar" type="search" placeholder="Buscar por nombre, teléfono, email o DNI" value={buscar}
          onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar" />
        <div className="pestanas" role="group" aria-label="Filtrar clientes">
          <button type="button" aria-pressed={!soloDeuda} onClick={() => setSoloDeuda(false)}>Todos</button>
          <button type="button" aria-pressed={soloDeuda} onClick={() => setSoloDeuda(true)}>Con saldo</button>
        </div>
        <button type="button" className="btn btn-sec" onClick={exportar} disabled={!filas.length}><Download size={16} />CSV</button>
      </div>

      <ErrorCarga error={clientes.error} />
      <div className="tabla-envoltorio">
        {filas.length === 0 ? (
          <Vacio titulo={clientes.cargando ? 'Cargando…' : buscar || soloDeuda ? 'Nadie coincide con la búsqueda' : 'Todavía no hay clientes'} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th><th>Teléfono</th><th className="ocultar-movil">Email</th>
                <th className="ocultar-movil">Sombras</th><th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => (
                <tr key={c.id} className="clic" tabIndex={0} onClick={() => navegar(`/clientes/${c.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navegar(`/clientes/${c.id}`)}>
                  <td><b>{c.nombre}</b></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.telefono || '—'}</td>
                  <td className="ocultar-movil">{c.email || '—'}</td>
                  <td className="ocultar-movil">{c.sombras.join(', ') || <span className="secundario">—</span>}</td>
                  <td className={c.saldo > 0 ? 'num deuda' : 'num'}>{c.saldo > 0 ? pesos(c.saldo) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {nuevo && <ClienteForm onCerrar={() => setNuevo(false)} onCreado={(id) => navegar(`/clientes/${id}`)} />}
    </>
  )
}
