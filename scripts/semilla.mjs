// Carga datos de prueba en el emulador de Firestore (nunca en producción:
// sólo habla con 127.0.0.1:8080 y el proyecto demo-oasis).
//
//   npm run emu          (en otra terminal)
//   npm run semilla
//   npm run dev:emu      y entrar como admin@oasis.test
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, doc, writeBatch } from 'firebase/firestore'

const env = await initializeTestEnvironment({
  projectId: 'demo-oasis',
  firestore: { host: '127.0.0.1', port: 8080 },
})
await env.clearFirestore()

const TZ = 'America/Argentina/Buenos_Aires'
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
const mas = (f, n) => new Date(Date.parse(f) + n * 86400000).toISOString().slice(0, 10)
const temporadaDe = (f) => {
  const [y, m] = f.split('-').map(Number)
  const i = m >= 7 ? y : y - 1
  return `${i}/${String((i + 1) % 100).padStart(2, '0')}`
}

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  const lote = writeBatch(db)
  const ahora = Timestamp.now()
  const quien = 'admin@oasis.test'

  lote.set(doc(db, 'staff', 'admin@oasis.test'), { nombre: 'Admin de prueba', rol: 'admin', activo: true })
  lote.set(doc(db, 'staff', 'encargado@oasis.test'), { nombre: 'Encargado de prueba', rol: 'manager', activo: true })
  lote.set(doc(db, 'staff', 'lectura@oasis.test'), { nombre: 'Contador', rol: 'lectura', activo: true })

  const unidades = []
  for (const [tipo, pre, n, sector] of [['carpa', 'C-', 24, 'Fila 1'], ['palapa', 'P-', 10, 'Frente al mar'], ['guorum', 'G-', 4, 'Pileta']]) {
    for (let i = 1; i <= n; i++) {
      const id = `${pre}${String(i).padStart(2, '0')}`
      unidades.push({ id, tipo })
      lote.set(doc(db, 'unidades', id), { codigo: id, tipo, sector, orden: i, activa: true })
    }
  }

  const nombres = ['Lucía Fernández', 'Martín Gómez', 'Sofía Rodríguez', 'Juan Pérez', 'Valentina López', 'Mateo Díaz',
    'Camila Martínez', 'Benjamín Sánchez', 'Martina Romero', 'Tomás Álvarez', 'Julieta Torres', 'Nicolás Ruiz']
  nombres.forEach((nombre, i) => lote.set(doc(db, 'clientes', `cli${i}`), {
    nombre, telefono: `2291 ${String(400000 + i * 1371).slice(0, 6)}`, email: '', documento: '', notas: '',
    creado: ahora, creadoPor: quien,
  }))

  const metodos = ['efectivo', 'transferencia', 'mercadopago', 'tarjeta']
  const modal = [['quincena', 15, 450000], ['mes', 30, 850000], ['semana', 7, 230000], ['dia', 1, 40000]]
  for (let i = 0; i < 18; i++) {
    const u = unidades[(i * 5) % unidades.length]
    const [modalidad, dias, precio] = modal[i % modal.length]
    const desde = mas(hoy, (i % 6) * 3 - 4)
    const hasta = mas(desde, dias - 1)
    const c = i % nombres.length
    const estado = i % 7 === 6 ? 'cancelada' : i % 4 === 3 ? 'pendiente' : 'confirmada'
    const temporada = temporadaDe(desde)
    lote.set(doc(db, 'reservas', `res${i}`), {
      unidadId: u.id, unidadCodigo: u.id, unidadTipo: u.tipo, clienteId: `cli${c}`, clienteNombre: nombres[c],
      desde, hasta, modalidad, temporada, precio, estado, notas: '', creado: ahora, creadoPor: quien,
    })
    if (estado !== 'cancelada') {
      const pagos = i % 3 === 0 ? [precio] : i % 3 === 1 ? [Math.round(precio / 2)] : []
      pagos.forEach((monto, k) => lote.set(doc(db, 'pagos', `pag${i}-${k}`), {
        reservaId: `res${i}`, clienteId: `cli${c}`, clienteNombre: nombres[c], unidadCodigo: u.id, temporada,
        monto, metodo: metodos[i % metodos.length], fecha: mas(hoy, -((i * 11) % 90)), nota: '', creado: ahora, creadoPor: quien,
      }))
    }
  }

  const consultas = [
    ['Paula Giménez', '2291 555123', 'whatsapp', 'carpa', 'Segunda quincena de enero', '¿Tienen carpas en primera fila?', 'nueva'],
    ['Diego Herrera', 'diego@example.com', 'email', 'palapa', 'Febrero completo', '', 'en_curso'],
    ['Flor Castro', '223 4567890', 'instagram', 'evento', '14 de febrero', 'Cumpleaños de 40 al atardecer, 30 personas', 'nueva'],
    ['Ramiro Molina', '2291 444222', 'telefono', 'carpa', 'Temporada', '', 'ganada'],
    ['Agustina Silva', '2291 333111', 'presencial', 'guorum', 'Enero', 'Pregunta por precios de pileta', 'perdida'],
  ]
  consultas.forEach(([nombre, contacto, canal, interes, fechas, mensaje, estado], i) =>
    lote.set(doc(db, 'consultas', `con${i}`), {
      nombre, contacto, canal, interes, fechas, mensaje, estado, clienteId: null,
      creado: Timestamp.fromMillis(Date.now() - i * 86400000 * 2), creadoPor: quien,
    }))

  await lote.commit()
})

await env.cleanup()
console.log('Listo: datos de prueba cargados en el emulador.')
