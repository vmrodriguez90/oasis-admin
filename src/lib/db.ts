import { useEffect, useState } from 'react'
import {
  Timestamp, addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where,
  type CollectionReference, type DocumentData, type DocumentReference, type FieldValue, type Query,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import type { Cliente, ConId, Consulta, Importacion, Pago, Reserva, Staff, Unidad } from './types'

function col<T>(nombre: string) {
  return collection(db, nombre) as CollectionReference<T, DocumentData>
}

export const C = {
  staff: col<Staff>('staff'),
  unidades: col<Unidad>('unidades'),
  clientes: col<Cliente>('clientes'),
  reservas: col<Reserva>('reservas'),
  pagos: col<Pago>('pagos'),
  consultas: col<Consulta>('consultas'),
  importaciones: col<Importacion>('importaciones'),
}

export const q = {
  reservasDeTemporada: (t: string) => query(C.reservas, where('temporada', '==', t)),
  pagosDeTemporada: (t: string) => query(C.pagos, where('temporada', '==', t)),
  reservasDeCliente: (id: string) => query(C.reservas, where('clienteId', '==', id)),
  pagosDeCliente: (id: string) => query(C.pagos, where('clienteId', '==', id)),
  pagosDeReserva: (id: string) => query(C.pagos, where('reservaId', '==', id)),
  importadas: () => query(C.reservas, where('origen', '==', 'importada')),
  consultasDeTemporada: (t: string) => {
    const y = Number(t.slice(0, 4))
    // La temporada va de julio a junio, en hora de Argentina.
    return query(C.consultas,
      where('creado', '>=', Timestamp.fromDate(new Date(`${y}-07-01T00:00:00-03:00`))),
      where('creado', '<', Timestamp.fromDate(new Date(`${y + 1}-07-01T00:00:00-03:00`))))
  },
}

export interface Lista<T> {
  datos: ConId<T>[]
  cargando: boolean
  error: Error | null
}

/**
 * Suscripción en vivo a una colección o consulta: si alguien carga un pago en
 * otro celular, aparece acá sin recargar. `clave` identifica la consulta, porque
 * las Query de Firestore no se pueden comparar entre renders.
 */
export function useLista<T>(fuente: Query<T, DocumentData> | null, clave: string): Lista<T> {
  const [estado, setEstado] = useState<Lista<T>>({ datos: [], cargando: true, error: null })
  useEffect(() => {
    if (!fuente) {
      setEstado({ datos: [], cargando: false, error: null })
      return
    }
    setEstado((e) => ({ ...e, cargando: true }))
    return onSnapshot(
      fuente,
      (snap) =>
        setEstado({
          datos: snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id })),
          cargando: false,
          error: null,
        }),
      (error) => setEstado({ datos: [], cargando: false, error }),
    )
  }, [clave])
  return estado
}

function quien(): string {
  const email = auth.currentUser?.email
  if (!email) throw new Error('Sesión vencida: volvé a entrar.')
  return email.toLowerCase()
}

type SinAuditoria<T> = Omit<T, 'creado' | 'creadoPor'>

/** Los campos de auditoría que exigen las reglas en cada alta. */
export function conAuditoria<D extends object>(datos: D): D & { creado: FieldValue; creadoPor: string } {
  return { ...datos, creado: serverTimestamp(), creadoPor: quien() }
}

export function crear<T>(ref: CollectionReference<T, DocumentData>, datos: SinAuditoria<T>) {
  return addDoc(collection(db, ref.path), conAuditoria(datos))
}

export function actualizar<T>(ref: CollectionReference<T, DocumentData>, id: string, cambios: Partial<SinAuditoria<T>>) {
  return updateDoc(doc(db, ref.path, id), cambios as DocumentData)
}

export function borrar<T>(ref: CollectionReference<T, DocumentData>, id: string) {
  return deleteDoc(doc(db, ref.path, id))
}

export function porId<T extends { id: string }>(xs: T[]): Map<string, T> {
  return new Map(xs.map((x) => [x.id, x]))
}

export function useDoc<T>(ref: DocumentReference<T, DocumentData> | null, clave: string) {
  const [estado, setEstado] = useState<{ dato: ConId<T> | null; cargando: boolean }>({ dato: null, cargando: true })
  useEffect(() => {
    if (!ref) {
      setEstado({ dato: null, cargando: false })
      return
    }
    return onSnapshot(
      ref,
      (snap) => setEstado({
        dato: snap.exists() ? { ...snap.data({ serverTimestamps: 'estimate' }), id: snap.id } : null,
        cargando: false,
      }),
      () => setEstado({ dato: null, cargando: false }),
    )
  }, [clave])
  return estado
}

/** Mensaje en castellano para un error de Firestore o de la app. */
export function mensajeDeError(e: unknown): string {
  const code = (e as { code?: string })?.code
  if (code === 'permission-denied') return 'No tenés permiso para hacer esto, o algún dato no es válido.'
  if (code === 'unavailable') return 'Sin conexión con el servidor. Probá de nuevo en un rato.'
  if (e instanceof Error && !code) return e.message
  return 'Algo salió mal. Probá de nuevo.'
}

/**
 * Reservas y pagos guardan una copia del nombre del cliente y del código de la
 * unidad para poder listarlos sin cruzar colecciones. Si el original cambia,
 * esto pone al día las copias.
 */
export async function propagarCambio(
  campo: 'clienteNombre' | 'unidadCodigo',
  filtro: 'clienteId' | 'unidadId',
  id: string,
  valor: string,
) {
  const reservas = await getDocs(query(C.reservas, where(filtro, '==', id)))
  // Los pagos no tienen unidadId: se ubican por su reserva.
  const pagos = filtro === 'clienteId'
    ? [await getDocs(query(C.pagos, where('clienteId', '==', id)))]
    : await Promise.all(reservas.docs.map((r) => getDocs(query(C.pagos, where('reservaId', '==', r.id)))))
  const refs = [reservas, ...pagos].flatMap((snap) =>
    snap.docs.filter((d) => d.get(campo) !== valor).map((d) => d.ref as DocumentReference<DocumentData>))
  await enTandas(refs.map((ref) => () => updateDoc(ref, { [campo]: valor })))
}

/**
 * Corre muchas escrituras de a varias por vez. No van en un lote: las reglas
 * permiten 20 lecturas de validación por lote, y cada reserva consulta su
 * unidad y su cliente, así que un lote grande de reservas se rechazaría.
 */
export async function enTandas(
  tareas: (() => Promise<unknown>)[],
  alAvanzar?: (hechas: number) => void,
  simultaneas = 25,
): Promise<void> {
  let siguiente = 0
  let hechas = 0
  async function trabajador() {
    while (siguiente < tareas.length) {
      const tarea = tareas[siguiente++]!
      await tarea()
      alAvanzar?.(++hechas)
    }
  }
  await Promise.all(Array.from({ length: Math.min(simultaneas, tareas.length) }, trabajador))
}
