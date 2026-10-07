import type { Timestamp } from 'firebase/firestore'

// Fechas de calendario como 'YYYY-MM-DD'. Una reserva es de días, no de
// instantes: guardarlas como string evita que la zona horaria corra un día.
export type Fecha = string

export type Rol = 'admin' | 'manager' | 'lectura'
export const ROLES: Record<Rol, string> = {
  admin: 'Administrador',
  manager: 'Encargado',
  lectura: 'Sólo lectura',
}

export type TipoUnidad = 'carpa' | 'palapa' | 'guorum'
export const TIPOS_UNIDAD: Record<TipoUnidad, string> = {
  carpa: 'Carpa',
  palapa: 'Palapa',
  guorum: 'Guorum',
}

export type Modalidad = 'dia' | 'semana' | 'quincena' | 'mes' | 'temporada'
export const MODALIDADES: Record<Modalidad, string> = {
  dia: 'Día',
  semana: 'Semana',
  quincena: 'Quincena',
  mes: 'Mes',
  temporada: 'Temporada',
}

export type EstadoReserva = 'pendiente' | 'confirmada' | 'cancelada'
export const ESTADOS_RESERVA: Record<EstadoReserva, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
}

export type MetodoPago = 'efectivo' | 'transferencia' | 'mercadopago' | 'tarjeta'
export const METODOS_PAGO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
  tarjeta: 'Tarjeta',
}

export type CanalConsulta = 'whatsapp' | 'telefono' | 'email' | 'instagram' | 'presencial' | 'web'
export const CANALES: Record<CanalConsulta, string> = {
  whatsapp: 'WhatsApp',
  telefono: 'Teléfono',
  email: 'Email',
  instagram: 'Instagram',
  presencial: 'Presencial',
  web: 'Sitio web',
}

export type InteresConsulta = TipoUnidad | 'evento' | 'otro'
export const INTERESES: Record<InteresConsulta, string> = {
  ...TIPOS_UNIDAD,
  evento: 'Evento',
  otro: 'Otro',
}

export type EstadoConsulta = 'nueva' | 'en_curso' | 'ganada' | 'perdida'
export const ESTADOS_CONSULTA: Record<EstadoConsulta, string> = {
  nueva: 'Nueva',
  en_curso: 'En curso',
  ganada: 'Ganada',
  perdida: 'Perdida',
}

/** Campos de auditoría que pone la app y validan las reglas. */
interface Auditado {
  creado: Timestamp | null
  creadoPor: string
}

/** staff/{email}: quién entra al admin y con qué rol. El id es el email en minúsculas. */
export interface Staff {
  nombre: string
  rol: Rol
  activo: boolean
}

/** unidades/{id}: el inventario de sombras. */
export interface Unidad {
  codigo: string
  tipo: TipoUnidad
  sector: string
  orden: number
  activa: boolean
}

/** clientes/{id} */
export interface Cliente extends Auditado {
  nombre: string
  telefono: string
  email: string
  documento: string
  notas: string
}

/** reservas/{id}. Denormaliza código de unidad y nombre de cliente para listar sin joins. */
export interface Reserva extends Auditado {
  unidadId: string
  unidadCodigo: string
  unidadTipo: TipoUnidad
  clienteId: string
  clienteNombre: string
  desde: Fecha
  /** Inclusive: una reserva de un día tiene desde === hasta. */
  hasta: Fecha
  modalidad: Modalidad
  temporada: string
  /** Pesos argentinos, enteros. */
  precio: number
  estado: EstadoReserva
  notas: string
}

/** pagos/{id}. Hereda la temporada de su reserva, no de la fecha de cobro. */
export interface Pago extends Auditado {
  reservaId: string
  clienteId: string
  clienteNombre: string
  unidadCodigo: string
  temporada: string
  monto: number
  metodo: MetodoPago
  fecha: Fecha
  nota: string
}

/** consultas/{id}: pedidos de información, de cualquier canal. */
export interface Consulta extends Auditado {
  nombre: string
  contacto: string
  canal: CanalConsulta
  interes: InteresConsulta
  fechas: string
  mensaje: string
  estado: EstadoConsulta
  clienteId: string | null
}

export type ConId<T> = T & { id: string }
