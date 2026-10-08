import { diasIncluidos, esFechaValida, temporadaDe } from './fechas'
import {
  PREFIJO_UNIDAD,
  type Cliente, type ConId, type EstadoReserva, type Fecha, type Modalidad, type Reserva, type TipoUnidad, type Unidad,
} from './types'

// Importa el archivo que exporta el sistema de reservas del club. Aunque se
// llama .xls, es una tabla HTML con estas columnas:
//
//   # · Estado · Unidad · Cliente · E-mail · Teléfono · Desde · Hasta ·
//   Cant dias · Importe · Saldo · Fecha de reserva
//
// Una reserva con varias unidades (carpa + cochera) ocupa varias filas con el
// mismo #; el importe, el saldo y la fecha vienen sólo en la primera y las
// demás traen «-». Todo acá es puro, para poder probarlo sin Firebase.

export interface FilaExport {
  /** Número de fila de datos en el archivo, para los avisos. */
  linea: number
  numero: string
  estado: string
  unidad: string
  cliente: string
  email: string
  telefono: string
  desde: Fecha
  hasta: Fecha
  importe: number | null
  saldo: number | null
  reservadaEl: Fecha | null
}

export interface Lectura {
  filas: FilaExport[]
  /** Si hay errores, el archivo no se puede importar. */
  errores: string[]
  /** Filas salteadas, con el motivo. */
  avisos: string[]
}

// ── Lectura de la tabla ───────────────────────────────────────────────

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTIDADES[e.toLowerCase()] ?? m
  })
}

function textoCelda(html: string): string {
  return decodificar(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function celdas(html: string, etiqueta: 'th' | 'td' | 't[hd]'): string[] {
  const re = new RegExp(`<${etiqueta}\\b[^>]*>([\\s\\S]*?)</${etiqueta}>`, 'gi')
  return [...html.matchAll(re)].map((m) => textoCelda(m[1]!))
}

/** Encabezados y filas de la primera tabla del archivo. */
export function leerTabla(html: string): { encabezados: string[]; filas: string[][] } {
  // El sistema escribe los <th> sueltos dentro de <thead>, sin <tr>.
  const thead = html.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i)
  let encabezados = thead ? celdas(thead[1]!, 'th') : []
  const filas: string[][] = []
  const cuerpo = thead ? html.slice(thead.index! + thead[0].length) : html
  for (const tr of cuerpo.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    if (!encabezados.length && /<th\b/i.test(tr[1]!)) {
      encabezados = celdas(tr[1]!, 'th')
      continue
    }
    const fila = celdas(tr[1]!, 't[hd]')
    if (fila.some((c) => c)) filas.push(fila)
  }
  return { encabezados, filas }
}

// ── Columnas ──────────────────────────────────────────────────────────

const normal = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const COLUMNAS = {
  numero: ['#', 'n', 'nº', 'no', 'nro', 'numero', 'reserva'],
  estado: ['estado'],
  unidad: ['unidad'],
  cliente: ['cliente', 'nombre'],
  email: ['e-mail', 'email', 'mail', 'correo'],
  telefono: ['telefono', 'tel', 'celular'],
  desde: ['desde', 'ingreso'],
  hasta: ['hasta', 'egreso'],
  importe: ['importe', 'total', 'precio'],
  saldo: ['saldo'],
  reservadaEl: ['fecha de reserva', 'fecha reserva', 'reservada', 'creada'],
} as const
type Columna = keyof typeof COLUMNAS
const OBLIGATORIAS: Columna[] = ['numero', 'estado', 'unidad', 'cliente', 'desde', 'hasta']

/** '31/12/2026' o '22/09/2026 19:39' -> '2026-12-31'. */
export function leerFecha(s: string): Fecha | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/)
  if (!m) return null
  const f = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
  return esFechaValida(f) ? f : null
}

/** '1611000.00', '1.611.000,00' o '-' -> pesos enteros o null. */
export function leerMonto(s: string): number | null {
  let t = s.replace(/[$\s]/g, '')
  if (!t || t === '-') return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n) : null
}

export function leerExport(html: string): Lectura {
  const { encabezados, filas } = leerTabla(html)
  const errores: string[] = []
  const avisos: string[] = []
  if (!encabezados.length || !filas.length) {
    return { filas: [], errores: ['No se encontró una tabla de reservas en el archivo. Subilo tal cual lo descarga el sistema.'], avisos }
  }

  const indice = {} as Record<Columna, number>
  const enc = encabezados.map(normal)
  for (const [col, alias] of Object.entries(COLUMNAS) as [Columna, readonly string[]][]) {
    indice[col] = enc.findIndex((e) => alias.includes(e))
  }
  const faltan = OBLIGATORIAS.filter((c) => indice[c] < 0)
  if (faltan.length) {
    errores.push(`Al archivo le faltan columnas: ${faltan.join(', ')}. Encontré: ${encabezados.join(', ')}.`)
    return { filas: [], errores, avisos }
  }

  const leidas: FilaExport[] = []
  filas.forEach((f, i) => {
    const v = (c: Columna) => (indice[c] >= 0 ? f[indice[c]] ?? '' : '')
    const linea = i + 1
    const desde = leerFecha(v('desde'))
    const hasta = leerFecha(v('hasta'))
    if (!v('numero')) return avisos.push(`Fila ${linea}: sin número de reserva, se saltea.`)
    if (!desde || !hasta) return avisos.push(`Fila ${linea} (#${v('numero')}): fechas inválidas, se saltea.`)
    if (desde > hasta) return avisos.push(`Fila ${linea} (#${v('numero')}): termina antes de empezar, se saltea.`)
    leidas.push({
      linea,
      numero: v('numero'),
      estado: v('estado'),
      unidad: v('unidad'),
      cliente: v('cliente'),
      email: v('email'),
      telefono: v('telefono'),
      desde,
      hasta,
      importe: leerMonto(v('importe')),
      saldo: leerMonto(v('saldo')),
      reservadaEl: leerFecha(v('reservadaEl')),
    })
  })

  // La fecha de reserva viene sólo en la primera fila de cada número.
  const fechaPorNumero = new Map<string, Fecha>()
  for (const f of leidas) if (f.reservadaEl && !fechaPorNumero.has(f.numero)) fechaPorNumero.set(f.numero, f.reservadaEl)
  for (const f of leidas) f.reservadaEl ??= fechaPorNumero.get(f.numero) ?? null

  if (!leidas.length) errores.push('El archivo no tiene ninguna fila que se pueda importar.')
  return { filas: leidas, errores, avisos }
}

// ── Traducciones ──────────────────────────────────────────────────────

const TIPO_POR_NOMBRE: Record<string, TipoUnidad> = {
  carpa: 'carpa', sombrilla: 'sombrilla', palapa: 'sombrilla', guarum: 'guorum', guorum: 'guorum',
  cochera: 'cochera', quincho: 'quincho',
}

/** 'Carpa #8' -> { tipo: 'carpa', numero: 8 }. */
export function leerUnidad(s: string): { tipo: TipoUnidad; numero: number } | null {
  const m = s.trim().match(/^(.*?)\s*#?\s*(\d+)$/)
  const tipo = m && TIPO_POR_NOMBRE[normal(m[1]!)]
  return tipo ? { tipo, numero: Number(m[2]) } : null
}

export function codigoUnidad(tipo: TipoUnidad, numero: number): string {
  return `${PREFIJO_UNIDAD[tipo]}${String(numero).padStart(2, '0')}`
}

const ESTADOS: Record<string, EstadoReserva> = {
  finalizada: 'confirmada', confirmada: 'confirmada', 'pre-confirmada': 'pendiente', preconfirmada: 'pendiente',
  pendiente: 'pendiente', cancelada: 'cancelada', anulada: 'cancelada',
}

export function leerEstado(s: string): EstadoReserva | null {
  return ESTADOS[normal(s).replace(/\s+/g, '')] ?? null
}

/** El sistema no informa la modalidad: se deduce de la cantidad de días. */
export function modalidadPorDias(dias: number): Modalidad {
  if (dias <= 1) return 'dia'
  if (dias <= 8) return 'semana'
  if (dias <= 16) return 'quincena'
  if (dias <= 31) return 'mes'
  return 'temporada'
}

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'di', 'van', 'von'])

/** «LAURA GIMÉNEZ» o «pedro de la fuente» -> «Laura Giménez», «Pedro de la Fuente». Lo demás queda como está. */
export function prolijarNombre(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t
  return t
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && PARTICULAS.has(w) ? w : w.replace(/(^|[-'])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())))
    .join(' ')
}

/** Hash FNV-1a de 64 bits: ids estables para lo importado, sin datos personales a la vista. */
function hash(s: string): string {
  let h = 0xcbf29ce484222325n
  for (const b of new TextEncoder().encode(s)) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n)
  return h.toString(36)
}

function claveCliente(nombre: string, email: string, telefono: string): string {
  const e = email.trim().toLowerCase()
  return e.includes('@') ? e : `n:${normal(nombre)}|${telefono.replace(/\D/g, '')}`
}

// ── Plan ──────────────────────────────────────────────────────────────

export type DatosReserva = Omit<Reserva, 'creado' | 'creadoPor'>
export type DatosCliente = Omit<Cliente, 'creado' | 'creadoPor'>

export interface Existentes {
  unidades: ConId<Unidad>[]
  clientes: ConId<Cliente>[]
  /** Las reservas importadas antes. */
  reservas: ConId<Reserva>[]
}

export interface Plan {
  unidadesNuevas: ConId<Unidad>[]
  clientesNuevos: ConId<DatosCliente>[]
  crear: ConId<DatosReserva>[]
  actualizar: ConId<DatosReserva>[]
  sinCambios: number
  filas: number
  /** Reservas del sistema que se importan (números distintos). */
  reservas: number
  temporadas: { temporada: string; reservas: number }[]
  avisos: string[]
}

const CAMPOS_COMPARADOS: (keyof DatosReserva)[] = [
  'unidadId', 'unidadCodigo', 'unidadTipo', 'clienteId', 'clienteNombre', 'desde', 'hasta', 'modalidad', 'temporada',
  'precio', 'estado', 'origen', 'externoId', 'saldoExterno', 'reservadaEl',
]

export function planificar(filas: FilaExport[], ex: Existentes): Plan {
  const avisos: string[] = []

  // Unidades: se reconocen por tipo y código, así se respetan las cargadas a mano.
  const unidades = new Map(ex.unidades.map((u) => [`${u.tipo}|${u.codigo.toLowerCase()}`, u]))
  const idsUnidad = new Set(ex.unidades.map((u) => u.id))
  const unidadesNuevas: ConId<Unidad>[] = []

  // Clientes: por email, o por nombre y teléfono si no dejaron email.
  const clientes = new Map<string, ConId<{ nombre: string }>>()
  for (const c of ex.clientes) clientes.set(claveCliente(c.nombre, c.email, c.telefono), c)
  const clientesNuevos: ConId<DatosCliente>[] = []

  const previas = new Map(ex.reservas.map((r) => [r.id, r]))
  const usados = new Map<string, number>()
  const crear: ConId<DatosReserva>[] = []
  const actualizar: ConId<DatosReserva>[] = []
  let sinCambios = 0
  const importados = new Set<string>()
  const porTemporada = new Map<string, Set<string>>()

  // Si una misma unidad aparece dos veces en una reserva (dos tramos), el
  // sufijo sale del orden por fecha, que no depende del orden del archivo.
  const ordenadas = [...filas].sort((a, b) => a.numero.localeCompare(b.numero) || a.desde.localeCompare(b.desde) || a.linea - b.linea)

  for (const f of ordenadas) {
    const u = leerUnidad(f.unidad)
    if (!u) {
      avisos.push(`Fila ${f.linea} (#${f.numero}): no reconozco la unidad «${f.unidad}», se saltea.`)
      continue
    }
    const estado = leerEstado(f.estado)
    if (!estado) {
      avisos.push(`Fila ${f.linea} (#${f.numero}): no reconozco el estado «${f.estado}», se saltea.`)
      continue
    }

    const codigo = codigoUnidad(u.tipo, u.numero)
    let unidad = unidades.get(`${u.tipo}|${codigo.toLowerCase()}`)
    if (!unidad) {
      let id = `${u.tipo}-${String(u.numero).padStart(2, '0')}`
      if (idsUnidad.has(id)) id += '-imp'
      unidad = { id, codigo, tipo: u.tipo, sector: '', orden: u.numero, activa: true }
      unidades.set(`${u.tipo}|${codigo.toLowerCase()}`, unidad)
      idsUnidad.add(id)
      unidadesNuevas.push(unidad)
    }

    const nombre = prolijarNombre(f.cliente).slice(0, 120) || 'Sin nombre'
    const clave = claveCliente(nombre, f.email, f.telefono)
    let cliente = clientes.get(clave)
    if (!cliente) {
      const nuevo: ConId<DatosCliente> = {
        id: `imp-${hash(clave)}`,
        nombre,
        telefono: f.telefono.trim().slice(0, 40),
        email: f.email.trim().toLowerCase().slice(0, 120),
        documento: '',
        notas: '',
      }
      clientes.set(clave, nuevo)
      clientesNuevos.push(nuevo)
      cliente = nuevo
    }

    const base = `imp-${f.numero}-${unidad.id}`
    const n = (usados.get(base) ?? 0) + 1
    usados.set(base, n)
    const id = n === 1 ? base : `${base}-${n}`

    const temporada = temporadaDe(f.desde)
    const previa = previas.get(id)
    const datos: DatosReserva = {
      unidadId: unidad.id,
      unidadCodigo: unidad.codigo,
      unidadTipo: unidad.tipo,
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      desde: f.desde,
      hasta: f.hasta,
      modalidad: modalidadPorDias(diasIncluidos(f.desde, f.hasta)),
      temporada,
      precio: Math.max(0, f.importe ?? 0),
      estado,
      notas: previa?.notas ?? '',
      origen: 'importada',
      externoId: f.numero.slice(0, 30),
      // Las unidades extra de una reserva no traen importe: su saldo queda null.
      saldoExterno: f.importe == null ? null : (f.saldo ?? 0),
      reservadaEl: f.reservadaEl,
    }

    importados.add(f.numero)
    if (!porTemporada.has(temporada)) porTemporada.set(temporada, new Set())
    porTemporada.get(temporada)!.add(f.numero)

    if (!previa) crear.push({ id, ...datos })
    else if (CAMPOS_COMPARADOS.some((k) => previa[k] !== datos[k])) actualizar.push({ id, ...datos })
    else sinCambios++
  }

  return {
    unidadesNuevas,
    clientesNuevos,
    crear,
    actualizar,
    sinCambios,
    filas: filas.length,
    reservas: importados.size,
    temporadas: [...porTemporada]
      .map(([temporada, s]) => ({ temporada, reservas: s.size }))
      .sort((a, b) => b.temporada.localeCompare(a.temporada)),
    avisos,
  }
}
