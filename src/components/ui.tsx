import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTemporada } from '../sesion'
import { hoy, temporadaDe, temporadasAlrededor } from '../lib/fechas'

export function Cabecera({ titulo, sub, children }: { titulo: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="cabecera">
      <div>
        <h1>{titulo}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="acciones">{children}</div>}
    </header>
  )
}

export function SelectorTemporada() {
  const { temporada, setTemporada } = useTemporada()
  const opciones = temporadasAlrededor(temporadaDe(hoy()))
  if (!opciones.includes(temporada)) opciones.push(temporada)
  return (
    <label className="campo" style={{ minWidth: 150 }}>
      <span className="sr-only">Temporada</span>
      <select className="input" value={temporada} onChange={(e) => setTemporada(e.target.value)}>
        {opciones.map((t) => (
          <option key={t} value={t}>Temporada {t}</option>
        ))}
      </select>
    </label>
  )
}

export function Modal({
  titulo, onCerrar, children, pie, ancho,
}: { titulo: string; onCerrar: () => void; children: ReactNode; pie?: ReactNode; ancho?: number }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className="modal"
      style={ancho ? { width: `min(${ancho}px, calc(100vw - 24px))` } : undefined}
      onClose={onCerrar}
      onClick={(e) => {
        // Click en el velo, fuera de la caja: cerrar.
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <div className="modal-cab">
        <h2>{titulo}</h2>
        <button type="button" className="btn btn-sec btn-icono" onClick={onCerrar} aria-label="Cerrar">
          <X size={18} />
        </button>
      </div>
      {children}
      {pie && <div className="modal-pie">{pie}</div>}
    </dialog>
  )
}

export function Campo({ label, ayuda, children }: { label: string; ayuda?: ReactNode; children: ReactNode }) {
  return (
    <label className="campo">
      <span>{label}</span>
      {children}
      {ayuda && <small>{ayuda}</small>}
    </label>
  )
}

export function Etiqueta({ clase, children }: { clase: string; children: ReactNode }) {
  return <span className={`etiqueta e-${clase}`}>{children}</span>
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vacio">
      <strong>{titulo}</strong>
      {children}
    </div>
  )
}

export function Cargando() {
  return <div className="cargando">Cargando…</div>
}

export function ErrorCarga({ error }: { error: Error | null }) {
  if (!error) return null
  return <p className="aviso">No se pudieron cargar los datos: {error.message}</p>
}
