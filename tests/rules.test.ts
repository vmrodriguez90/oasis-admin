import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore'

let env: RulesTestEnvironment

const ADMIN = 'admin@oasis.test'
const MANAGER = 'manager@oasis.test'
const LECTOR = 'lector@oasis.test'
const BAJA = 'baja@oasis.test'

function como(email: string, verificado = true) {
  return env.authenticatedContext(email.split('@')[0]!, { email, email_verified: verificado }).firestore()
}

const reservaBase = (creadoPor: string) => ({
  unidadId: 'c01', unidadCodigo: 'C-01', unidadTipo: 'carpa', clienteId: 'cli1', clienteNombre: 'Ana',
  desde: '2027-01-10', hasta: '2027-01-24', modalidad: 'quincena', temporada: '2026/27', precio: 450000,
  estado: 'confirmada', notas: '', creado: serverTimestamp(), creadoPor,
})

const pagoBase = (creadoPor: string) => ({
  reservaId: 'res1', clienteId: 'cli1', clienteNombre: 'Ana', unidadCodigo: 'C-01', temporada: '2026/27',
  monto: 100000, metodo: 'transferencia', fecha: '2027-01-05', nota: '', creado: serverTimestamp(), creadoPor,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-oasis',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

afterAll(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'staff', ADMIN), { nombre: 'Admin', rol: 'admin', activo: true })
    await setDoc(doc(db, 'staff', MANAGER), { nombre: 'Encargado', rol: 'manager', activo: true })
    await setDoc(doc(db, 'staff', LECTOR), { nombre: 'Lector', rol: 'lectura', activo: true })
    await setDoc(doc(db, 'staff', BAJA), { nombre: 'Baja', rol: 'manager', activo: false })
    await setDoc(doc(db, 'unidades', 'c01'), { codigo: 'C-01', tipo: 'carpa', sector: 'A', orden: 1, activa: true })
    await setDoc(doc(db, 'clientes', 'cli1'), {
      nombre: 'Ana', telefono: '', email: '', documento: '', notas: '', creado: new Date(), creadoPor: MANAGER,
    })
    await setDoc(doc(db, 'reservas', 'res1'), { ...reservaBase(MANAGER), creado: new Date() })
  })
})

describe('acceso', () => {
  it('sin sesión no se lee nada', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'reservas/res1')))
  })

  it('un email de Google que no está en staff no entra', async () => {
    await assertFails(getDocs(collection(como('extraño@gmail.com'), 'reservas')))
  })

  it('un email sin verificar no entra aunque esté en staff', async () => {
    await assertFails(getDocs(collection(como(MANAGER, false), 'reservas')))
  })

  it('un miembro dado de baja no entra', async () => {
    await assertFails(getDocs(collection(como(BAJA), 'reservas')))
  })

  it('el de sólo lectura lee pero no escribe', async () => {
    const db = como(LECTOR)
    await assertSucceeds(getDocs(collection(db, 'reservas')))
    await assertFails(addDoc(collection(db, 'reservas'), reservaBase(LECTOR)))
  })

  it('cada uno lee su ficha de staff, pero no las de otros', async () => {
    const db = como(MANAGER)
    await assertSucceeds(getDoc(doc(db, 'staff', MANAGER)))
    await assertFails(getDoc(doc(db, 'staff', ADMIN)))
    await assertFails(getDocs(collection(db, 'staff')))
  })

  it('el email del token se compara en minúsculas', async () => {
    await assertSucceeds(getDocs(collection(como('Manager@Oasis.test'), 'reservas')))
  })
})

describe('equipo', () => {
  it('sólo el admin da acceso', async () => {
    const nuevo = { nombre: 'Nuevo', rol: 'manager', activo: true }
    await assertFails(setDoc(doc(como(MANAGER), 'staff', 'nuevo@oasis.test'), nuevo))
    await assertSucceeds(setDoc(doc(como(ADMIN), 'staff', 'nuevo@oasis.test'), nuevo))
  })

  it('rechaza roles inventados y emails con mayúsculas', async () => {
    const db = como(ADMIN)
    await assertFails(setDoc(doc(db, 'staff', 'x@oasis.test'), { nombre: 'X', rol: 'dueño', activo: true }))
    await assertFails(setDoc(doc(db, 'staff', 'X@oasis.test'), { nombre: 'X', rol: 'manager', activo: true }))
  })

  it('el admin no puede bajarse el rol, desactivarse ni borrarse', async () => {
    const db = como(ADMIN)
    await assertFails(updateDoc(doc(db, 'staff', ADMIN), { rol: 'manager' }))
    await assertFails(updateDoc(doc(db, 'staff', ADMIN), { activo: false }))
    await assertFails(deleteDoc(doc(db, 'staff', ADMIN)))
    await assertSucceeds(updateDoc(doc(db, 'staff', ADMIN), { nombre: 'Otro nombre' }))
    await assertSucceeds(updateDoc(doc(db, 'staff', MANAGER), { rol: 'lectura' }))
  })

  it('un manager no se sube el rol a sí mismo', async () => {
    await assertFails(updateDoc(doc(como(MANAGER), 'staff', MANAGER), { rol: 'admin' }))
  })
})

describe('unidades', () => {
  it('sólo el admin toca el inventario', async () => {
    const u = { codigo: 'P-01', tipo: 'palapa', sector: '', orden: 1, activa: true }
    await assertFails(setDoc(doc(como(MANAGER), 'unidades', 'p01'), u))
    await assertSucceeds(setDoc(doc(como(ADMIN), 'unidades', 'p01'), u))
    await assertFails(setDoc(doc(como(ADMIN), 'unidades', 'p02'), { ...u, tipo: 'yate' }))
  })
})

describe('reservas', () => {
  it('el encargado carga una reserva válida', async () => {
    await assertSucceeds(addDoc(collection(como(MANAGER), 'reservas'), reservaBase(MANAGER)))
  })

  it('no se puede firmar como otro', async () => {
    await assertFails(addDoc(collection(como(MANAGER), 'reservas'), reservaBase(ADMIN)))
  })

  it('el sello de alta lo pone el servidor', async () => {
    await assertFails(addDoc(collection(como(MANAGER), 'reservas'), { ...reservaBase(MANAGER), creado: new Date('2020-01-01') }))
  })

  it('rechaza fechas al revés, temporada que no corresponde y precios con decimales', async () => {
    const db = como(MANAGER)
    await assertFails(addDoc(collection(db, 'reservas'), { ...reservaBase(MANAGER), desde: '2027-02-01', hasta: '2027-01-01' }))
    await assertFails(addDoc(collection(db, 'reservas'), { ...reservaBase(MANAGER), temporada: '2027/28' }))
    await assertFails(addDoc(collection(db, 'reservas'), { ...reservaBase(MANAGER), precio: 1000.5 }))
    await assertFails(addDoc(collection(db, 'reservas'), { ...reservaBase(MANAGER), desde: '2027-13-01' }))
  })

  it('acepta la temporada de una reserva de diciembre', async () => {
    await assertSucceeds(addDoc(collection(como(MANAGER), 'reservas'), {
      ...reservaBase(MANAGER), desde: '2026-12-20', hasta: '2026-12-31',
    }))
  })

  it('acepta un cliente nuevo y su reserva en el mismo lote', async () => {
    const db = como(MANAGER)
    const lote = writeBatch(db)
    const cli = doc(collection(db, 'clientes'))
    lote.set(cli, { nombre: 'Dani', telefono: '', email: '', documento: '', notas: '', creado: serverTimestamp(), creadoPor: MANAGER })
    lote.set(doc(collection(db, 'reservas')), { ...reservaBase(MANAGER), clienteId: cli.id, clienteNombre: 'Dani' })
    await assertSucceeds(lote.commit())
  })

  it('rechaza unidades o clientes que no existen y campos de más', async () => {
    const db = como(MANAGER)
    await assertFails(addDoc(collection(db, 'reservas'), { ...reservaBase(MANAGER), unidadId: 'nope' }))
    await assertFails(addDoc(collection(db, 'reservas'), { ...reservaBase(MANAGER), clienteId: 'nope' }))
    await assertFails(addDoc(collection(db, 'reservas'), { ...reservaBase(MANAGER), descuento: 10 }))
  })

  it('el encargado cancela pero no borra, ni toca la auditoría', async () => {
    const db = como(MANAGER)
    await assertSucceeds(updateDoc(doc(db, 'reservas/res1'), { estado: 'cancelada' }))
    await assertFails(updateDoc(doc(db, 'reservas/res1'), { creadoPor: ADMIN }))
    await assertFails(deleteDoc(doc(db, 'reservas/res1')))
    await assertSucceeds(deleteDoc(doc(como(ADMIN), 'reservas/res1')))
  })
})

describe('pagos', () => {
  it('el encargado registra un pago de una reserva existente', async () => {
    await assertSucceeds(addDoc(collection(como(MANAGER), 'pagos'), pagoBase(MANAGER)))
  })

  it('el pago tiene que coincidir con su reserva', async () => {
    const db = como(MANAGER)
    await assertFails(addDoc(collection(db, 'pagos'), { ...pagoBase(MANAGER), reservaId: 'nope' }))
    await assertFails(addDoc(collection(db, 'pagos'), { ...pagoBase(MANAGER), clienteId: 'otro' }))
    await assertFails(addDoc(collection(db, 'pagos'), { ...pagoBase(MANAGER), temporada: '2025/26' }))
  })

  it('rechaza montos en cero, negativos o métodos inventados', async () => {
    const db = como(MANAGER)
    await assertFails(addDoc(collection(db, 'pagos'), { ...pagoBase(MANAGER), monto: 0 }))
    await assertFails(addDoc(collection(db, 'pagos'), { ...pagoBase(MANAGER), monto: -5 }))
    await assertFails(addDoc(collection(db, 'pagos'), { ...pagoBase(MANAGER), metodo: 'cripto' }))
  })

  it('un pago no se edita, y sólo el admin lo borra', async () => {
    const ref = await addDoc(collection(como(MANAGER), 'pagos'), pagoBase(MANAGER))
    await assertFails(updateDoc(doc(como(MANAGER), 'pagos', ref.id), { monto: 1 }))
    await assertFails(updateDoc(doc(como(ADMIN), 'pagos', ref.id), { monto: 1 }))
    await assertFails(updateDoc(doc(como(ADMIN), 'pagos', ref.id), { clienteNombre: 'Ana B.', monto: 1 }))
    await assertSucceeds(updateDoc(doc(como(MANAGER), 'pagos', ref.id), { clienteNombre: 'Ana B.' }))
    await assertFails(updateDoc(doc(como(LECTOR), 'pagos', ref.id), { clienteNombre: 'Ana C.' }))
    await assertFails(deleteDoc(doc(como(MANAGER), 'pagos', ref.id)))
    await assertSucceeds(deleteDoc(doc(como(ADMIN), 'pagos', ref.id)))
  })
})

describe('clientes y consultas', () => {
  it('el encargado carga clientes y consultas', async () => {
    const db = como(MANAGER)
    await assertSucceeds(addDoc(collection(db, 'clientes'), {
      nombre: 'Beto', telefono: '2291 000000', email: '', documento: '', notas: '',
      creado: serverTimestamp(), creadoPor: MANAGER,
    }))
    await assertSucceeds(addDoc(collection(db, 'consultas'), {
      nombre: 'Caro', contacto: '2291 111111', canal: 'whatsapp', interes: 'palapa', fechas: 'enero',
      mensaje: '', estado: 'nueva', clienteId: null, creado: serverTimestamp(), creadoPor: MANAGER,
    }))
  })

  it('un cliente sin nombre no pasa', async () => {
    await assertFails(addDoc(collection(como(MANAGER), 'clientes'), {
      nombre: '', telefono: '', email: '', documento: '', notas: '', creado: serverTimestamp(), creadoPor: MANAGER,
    }))
  })
})
