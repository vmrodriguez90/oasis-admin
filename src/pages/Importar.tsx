import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { doc, getDocs, limit, orderBy, query, setDoc, updateDoc } from 'firebase/firestore'
import { FileUp } from 'lucide-react'
import { Cabecera, ErrorCarga, Vacio } from '../components/ui'
import { C, conAuditoria, crear, enTandas, mensajeDeError, q, useLista } from '../lib/db'
import { leerExport, planificar, type Plan } from '../lib/importar'
import { plural } from '../lib/fechas'
import { useAvisos } from '../sesion'

const ultimas = query(C.importaciones, orderBy('creado', 'desc'), limit(5))

/** El sistema guarda en UTF-8; si alguien lo re-guardó desde Excel puede venir en Windows-1252. */
async function leerArchivo(f: File): Promise<string> {
  const bytes = await f.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

type Estado =
  | { paso: 'elegir' }
  | { paso: 'analizando' }
  | { paso: 'revisar'; archivo: string; plan: Plan }
  | { paso: 'importando'; archivo: string; plan: Plan; hechas: number; total: number }
  | { paso: 'listo'; plan: Plan }

export function Importar() {
  const historial = useLista(ultimas, 'importaciones')
  const avisar = useAvisos()
  const [estado, setEstado] = useState<Estado>({ paso: 'elegir' })
  const [error, setError] = useState<string | null>(null)

  async function elegir(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(null)
    setEstado({ paso: 'analizando' })
    try {
      const lectura = leerExport(await leerArchivo(f))
      if (lectura.errores.length) {
        setError(lectura.errores.join(' '))
        return setEstado({ paso: 'elegir' })
      }
      // Lo que ya hay, leído del servidor: el plan sólo crea o cambia lo que falta.
      const [unidades, clientes, reservas] = await Promise.all([getDocs(C.unidades), getDocs(C.clientes), getDocs(q.importadas())])
      const plan = planificar(lectura.filas, {
        unidades: unidades.docs.map((d) => ({ ...d.data(), id: d.id })),
        clientes: clientes.docs.map((d) => ({ ...d.data(), id: d.id })),
        reservas: reservas.docs.map((d) => ({ ...d.data(), id: d.id })),
      })
      plan.avisos.unshift(...lectura.avisos)
      setEstado({ paso: 'revisar', archivo: f.name, plan })
    } catch (err) {
      setError(mensajeDeError(err))
      setEstado({ paso: 'elegir' })
    }
  }

  async function importar(archivo: string, plan: Plan) {
    const total = plan.unidadesNuevas.length + plan.clientesNuevos.length + plan.crear.length + plan.actualizar.length
    let base = 0
    const avance = (hechas: number) => setEstado({ paso: 'importando', archivo, plan, hechas: base + hechas, total })
    avance(0)
    try {
      // En orden: las reglas exigen que la unidad y el cliente existan antes que la reserva.
      await enTandas(plan.unidadesNuevas.map(({ id, ...u }) => () => setDoc(doc(C.unidades, id), u)), avance)
      base += plan.unidadesNuevas.length
      await enTandas(plan.clientesNuevos.map(({ id, ...c }) => () => setDoc(doc(C.clientes, id), conAuditoria(c))), avance)
      base += plan.clientesNuevos.length
      await enTandas([
        ...plan.crear.map(({ id, ...r }) => () => setDoc(doc(C.reservas, id), conAuditoria(r))),
        ...plan.actualizar.map(({ id, ...r }) => () => updateDoc(doc(C.reservas, id), r)),
      ], avance)
      await crear(C.importaciones, {
        archivo: archivo.slice(0, 200),
        filas: plan.filas,
        reservas: plan.reservas,
        creadas: plan.crear.length,
        actualizadas: plan.actualizar.length,
        clientesNuevos: plan.clientesNuevos.length,
        unidadesNuevas: plan.unidadesNuevas.length,
      })
      avisar('Importación terminada.')
      setEstado({ paso: 'listo', plan })
    } catch (err) {
      // Lo que llegó a escribirse queda; volver a importar el mismo archivo completa el resto.
      setError(`${mensajeDeError(err)} Lo que se alcanzó a importar quedó guardado: volvé a subir el mismo archivo para completar.`)
      setEstado({ paso: 'elegir' })
    }
  }

  return (
    <>
      <Cabecera
        titulo="Importar"
        sub="Reservas del sistema de reservas del club, para verlas acá y en las estadísticas."
      />

      <div className="grilla g-2" style={{ alignItems: 'start' }}>
        <section className="tarjeta" style={{ display: 'grid', gap: 14 }}>
          {(estado.paso === 'elegir' || estado.paso === 'analizando') && (
            <>
              <div>
                <h2>Subir el archivo</h2>
                <p className="sub" style={{ marginBottom: 0 }}>
                  El que descarga el sistema en Reservas → Exportar (Reservas_AAAAMMDD….xls), sin abrirlo ni
                  cambiarlo. Se puede volver a importar cuando quieras: pone al día lo que cambió y no duplica nada.
                </p>
              </div>
              <label className="soltar">
                <FileUp size={22} />
                <span>{estado.paso === 'analizando' ? 'Leyendo el archivo…' : 'Elegir archivo'}</span>
                <input type="file" accept=".xls,.html,.htm" onChange={elegir} disabled={estado.paso === 'analizando'} className="sr-only" />
              </label>
            </>
          )}

          {estado.paso === 'revisar' && (
            <>
              <div>
                <h2>{estado.archivo}</h2>
                <p className="sub" style={{ marginBottom: 0 }}>
                  {plural(estado.plan.filas, 'fila', 'filas')} · {plural(estado.plan.reservas, 'reserva', 'reservas')} ·{' '}
                  {estado.plan.temporadas.map((t) => `${t.temporada}: ${t.reservas}`).join(' · ')}
                </p>
              </div>
              <dl className="ficha">
                <dt>Unidades nuevas</dt><dd>{estado.plan.unidadesNuevas.length}</dd>
                <dt>Clientes nuevos</dt><dd>{estado.plan.clientesNuevos.length}</dd>
                <dt>Reservas nuevas</dt><dd>{estado.plan.crear.length}</dd>
                <dt>Reservas que cambiaron</dt><dd>{estado.plan.actualizar.length}</dd>
                <dt>Sin cambios</dt><dd>{estado.plan.sinCambios}</dd>
              </dl>
              {estado.plan.avisos.length > 0 && (
                <details className="nota">
                  <summary>{plural(estado.plan.avisos.length, 'fila salteada', 'filas salteadas')}</summary>
                  <ul style={{ margin: '8px 0 0 18px' }}>
                    {estado.plan.avisos.slice(0, 50).map((a) => <li key={a}>{a}</li>)}
                  </ul>
                </details>
              )}
              <p className="secundario">
                Las reservas importadas no se editan acá: se gestionan en el sistema de reservas, y para ponerlas al
                día se vuelve a importar. Las notas que les agregues acá se conservan.
              </p>
              <div className="acciones">
                <button type="button" className="btn btn-sec" onClick={() => setEstado({ paso: 'elegir' })}>Cancelar</button>
                {estado.plan.crear.length + estado.plan.actualizar.length + estado.plan.clientesNuevos.length + estado.plan.unidadesNuevas.length > 0 ? (
                  <button type="button" className="btn" onClick={() => importar(estado.archivo, estado.plan)}>Importar</button>
                ) : (
                  <span className="secundario">No hay nada nuevo para importar.</span>
                )}
              </div>
            </>
          )}

          {estado.paso === 'importando' && (
            <>
              <h2>Importando {estado.archivo}…</h2>
              <div className="medidor" role="progressbar" aria-valuemin={0} aria-valuemax={estado.total} aria-valuenow={estado.hechas}>
                <div style={{ width: `${estado.total ? (estado.hechas / estado.total) * 100 : 100}%` }} />
              </div>
              <p className="secundario">{estado.hechas.toLocaleString('es-AR')} de {estado.total.toLocaleString('es-AR')}. No cierres esta pestaña.</p>
            </>
          )}

          {estado.paso === 'listo' && (
            <>
              <h2>Listo</h2>
              <p>
                {plural(estado.plan.crear.length, 'reserva nueva', 'reservas nuevas')},{' '}
                {plural(estado.plan.actualizar.length, 'actualizada', 'actualizadas')},{' '}
                {plural(estado.plan.clientesNuevos.length, 'cliente nuevo', 'clientes nuevos')}.
              </p>
              <div className="acciones">
                <Link className="btn" to="/">Ver estadísticas</Link>
                <button type="button" className="btn btn-sec" onClick={() => setEstado({ paso: 'elegir' })}>Importar otro</button>
              </div>
            </>
          )}

          {error && <p className="aviso">{error}</p>}
        </section>

        <section className="tarjeta">
          <h2>Últimas importaciones</h2>
          <ErrorCarga error={historial.error} />
          {historial.datos.length === 0 ? (
            <Vacio titulo={historial.cargando ? 'Cargando…' : 'Todavía no se importó nada'} />
          ) : (
            <table style={{ marginTop: 8 }}>
              <tbody>
                {historial.datos.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.creado?.toDate().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                      <div className="secundario">{i.creadoPor}</div>
                    </td>
                    <td>
                      {i.archivo}
                      <div className="secundario">
                        {plural(i.reservas, 'reserva', 'reservas')} · {i.creadas} nuevas · {i.actualizadas} actualizadas
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  )
}
