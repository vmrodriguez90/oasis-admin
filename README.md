# oasis-admin

Admin interno de **OASIS Club de Mar** (Miramar): reservas de carpas y
palapas, clientes y pagos, consultas y estadísticas de la temporada.

El sitio público ([oasismiramar.com.ar](https://oasismiramar.com.ar), repo
`oasis-club-miramar`) **no cambia**: sigue siendo HTML estático en GitHub
Pages y no carga nada de Firebase. Este admin es otra aplicación, con su
propio dominio y sus propios datos.

```
oasismiramar.com.ar          GitHub Pages     sitio público, estático (sin cambios)
admin.oasismiramar.com.ar    Firebase Hosting este admin
                               ├─ Authentication (Google)
                               └─ Firestore (reservas, clientes, pagos…)
```

## Qué hace

| Sección | |
|---|---|
| **Estadísticas** | Cobrado y pendiente de la temporada, ocupación de hoy por tipo, quién entra y quién sale, ocupación de los próximos 14 días, cobros por mes y por medio de pago, consultas y conversión. |
| **Reservas** | Mapa del día con cada sombra libre u ocupada (tocás una libre y reservás). Lista de la temporada con filtros, saldos y exportación a CSV. No deja reservar una sombra que ya está tomada en esas fechas. |
| **Clientes** | Ficha con historia de todas las temporadas, saldo, pagos y link directo a WhatsApp. |
| **Pagos** | Se registran desde cada reserva (seña, cuotas, saldo). Listado por mes y medio de pago, exportable a CSV. |
| **Consultas** | Pedidos que llegan por WhatsApp, teléfono, redes o en persona, con estado (nueva → en curso → ganada/perdida) y «Hacer cliente» en un toque. |
| **Sombras** *(admin)* | Inventario de carpas, palapas y guorums. Se cargan de a muchas («C-01 a C-40»). |
| **Equipo** *(admin)* | Quién entra y con qué rol. |

Funciona en el celular, y sin señal sigue mostrando lo último cargado: lo que
se carga offline se sube solo cuando vuelve la conexión.

### Roles

| Rol | Puede |
|---|---|
| Administrador | Todo, más dar acceso, cargar sombras y borrar. |
| Encargado | Cargar y editar reservas, clientes, pagos y consultas. Cancela, no borra. |
| Sólo lectura | Ver todo (para un contador, por ejemplo). |

La seguridad está en [`firestore.rules`](firestore.rules), no en la app: el
navegador se puede manipular, las reglas no. Están probadas en
[`tests/rules.test.ts`](tests/rules.test.ts).

## Puesta en marcha (una sola vez)

Alcanza con el plan gratuito de Firebase (Spark): Authentication, Firestore y
Hosting entran en la cuota gratis para un club de este tamaño.

1. **Crear el proyecto** en [console.firebase.google.com](https://console.firebase.google.com)
   (Analytics no hace falta). Anotá el ID del proyecto y ponelo en
   [`.firebaserc`](.firebaserc) en lugar de `oasis-admin`.
2. **Firestore** → Crear base de datos → modo producción → ubicación
   `southamerica-east1` (San Pablo, la más cercana; no se puede cambiar después).
3. **Authentication** → Comenzar → Método de acceso → **Google** → habilitar.
4. **Configuración del proyecto** → Tus apps → **Web** (`</>`) → registrar.
   Copiá los valores de `firebaseConfig` a un archivo `.env.local` siguiendo
   [`.env.example`](.env.example).
5. **Publicar**:
   ```bash
   npm install
   npx firebase login
   npm run deploy          # sube las reglas de Firestore y el admin
   ```
6. **El primer administrador** se carga a mano, porque todavía no hay nadie
   que pueda dar acceso: en la consola, Firestore → Iniciar colección `staff` →
   ID del documento = tu email **en minúsculas** → campos:
   `nombre` (string), `rol` = `admin` (string), `activo` = `true` (boolean).
   Desde ahí, el resto del equipo se agrega en **Equipo** dentro del admin.
7. **Dominio** `admin.oasismiramar.com.ar`: Hosting → Agregar dominio
   personalizado, y cargar los registros que pide en el DNS de
   `oasismiramar.com.ar`. Son registros nuevos para el subdominio `admin`:
   **no se tocan** los del dominio principal que apuntan a GitHub Pages.
   Después, en Authentication → Configuración → Dominios autorizados, agregar
   `admin.oasismiramar.com.ar`.

## Desarrollo

Todo corre local contra los emuladores de Firebase, sin tocar datos reales
(hace falta Java 11+ para el emulador de Firestore):

```bash
npm run emu        # emuladores de Auth y Firestore (dejalo corriendo)
npm run semilla    # carga datos de prueba: sombras, clientes, reservas…
npm run dev:emu    # http://localhost:5173 → «Entrar (emulador)»
```

Con emuladores aparece un acceso de prueba en el login: `admin@oasis.test`,
`encargado@oasis.test` o `lectura@oasis.test`.

```bash
npm run typecheck
npm test               # lógica: fechas, saldos, choques, estadísticas
npm run test:rules     # reglas de seguridad, contra el emulador
npm run build
```

## Modelo de datos

| Colección | Qué guarda |
|---|---|
| `staff/{email}` | `nombre`, `rol` (`admin`/`manager`/`lectura`), `activo` |
| `unidades` | `codigo` («C-12»), `tipo` (`carpa`/`palapa`/`guorum`), `sector`, `orden`, `activa` |
| `clientes` | `nombre`, `telefono`, `email`, `documento`, `notas` |
| `reservas` | `unidadId`, `clienteId`, `desde`, `hasta`, `modalidad`, `temporada`, `precio`, `estado`, `notas` |
| `pagos` | `reservaId`, `clienteId`, `temporada`, `monto`, `metodo`, `fecha`, `nota` |
| `consultas` | `nombre`, `contacto`, `canal`, `interes`, `fechas`, `mensaje`, `estado`, `clienteId` |

Decisiones que conviene conocer:

- **Fechas como `'YYYY-MM-DD'`**, no como instantes: una reserva es de días,
  y así la zona horaria nunca corre un día. `hasta` es inclusive.
- **La temporada va de julio a junio** y se nombra «2026/27». Un pago
  pertenece a la temporada de su reserva, no a la de la fecha en que se cobró.
- **Montos en pesos enteros.**
- **Los pagos no se editan**: quedan firmados por quien los cargó. Si hay un
  error, un admin lo borra y se carga de nuevo.
- Reservas y pagos guardan **copia** del nombre del cliente y del código de la
  sombra, para listar sin cruzar colecciones; al renombrar, la app pone al día
  las copias.
- Que dos reservas no se pisen lo controla la app al guardar. Si dos personas
  reservaran la misma sombra en el mismo segundo desde dos celulares, podrían
  entrar las dos; el mapa lo mostraría y se cancela una.

## Próximos pasos posibles

- **Métricas del sitio** (visitas, clics a WhatsApp): el sitio ya tiene Google
  Tag Manager; con una propiedad de GA4 se puede sumar un informe de Looker
  Studio, o leerlas desde una Cloud Function (requiere plan Blaze).
- **Formulario de contacto** en el sitio público que cree la consulta acá
  directamente, en vez de cargarla a mano desde WhatsApp.
- **Backups programados** de Firestore (requiere plan Blaze).
