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

// Los mismos tipos que usa el sistema de reservas del club, en ese orden.
export type TipoUnidad = 'carpa' | 'sombrilla' | 'guorum' | 'cochera' | 'quincho'
export const TIPOS_UNIDAD: Record<TipoUnidad, string> = {
  carpa: 'Carpa',
  sombrilla: 'Sombrilla',
  guorum: 'Guorum',
  cochera: 'Cochera',
  quincho: 'Quincho',
}
export const PREFIJO_UNIDAD: Record<TipoUnidad, string> = {
  carpa: 'C-', sombrilla: 'S-', guorum: 'G-', cochera: 'CO-', quincho: 'Q-',
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

/** unidades/{id}: el inventario: carpas, sombrillas, guorums, cocheras y el quincho. */
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

export type OrigenReserva = 'manual' | 'importada'

/**
 * reservas/{id}: una unidad, un cliente, un rango de fechas. Denormaliza
 * código de unidad y nombre de cliente para listar sin joins.
 *
 * Las importadas vienen del sistema de reservas del club: una reserva de allá
 * con varias unidades (carpa + cochera) es acá un documento por unidad, todos
 * con el mismo `externoId`. El importe y el saldo vienen sólo en la unidad
 * principal; las demás llevan precio 0 y `saldoExterno` null.
 */
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
  origen: OrigenReserva
  /** Número de reserva en el sistema de reservas («#900123»). */
  externoId: string | null
  /** Saldo que informa el sistema de reservas. Negativo si pagó de más. */
  saldoExterno: number | null
  /** Día en que se hizo la reserva: para ver cuándo se vende y con cuánta anticipación. */
  reservadaEl: Fecha | null
}

/** importaciones/{id}: registro de cada archivo importado. */
export interface Importacion extends Auditado {
  archivo: string
  filas: number
  reservas: number
  creadas: number
  actualizadas: number
  clientesNuevos: number
  unidadesNuevas: number
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
