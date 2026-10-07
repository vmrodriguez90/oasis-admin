# oasis-admin

Admin interno de OASIS Club de Mar. Vite + React + TypeScript sobre Firebase
(Auth con Google, Firestore, Hosting). El sitio público vive en otro repo
(`oasis-club-miramar`, GitHub Pages) y **no** depende de este.

- `src/lib/` — lógica pura (fechas, saldos, choques, estadísticas) con tests en `*.test.ts`
- `src/lib/db.ts` — colecciones tipadas, `useLista`/`useDoc` en vivo, altas con auditoría
- `src/sesion.tsx` — sesión, rol, temporada elegida, avisos y `useGuardar`
- `src/pages/` — una por sección; `src/components/` — modales y piezas compartidas
- `firestore.rules` — la seguridad real; `tests/rules.test.ts` la prueba
- `scripts/semilla.mjs` — datos de prueba para el emulador

## Verificar

```bash
npm run typecheck && npm test && npm run build
npm run test:rules      # necesita Java; levanta el emulador solo
```

Para ver la app: `npm run emu`, `npm run semilla`, `npm run dev:emu`.

## Convenciones

- Todo en castellano rioplatense, como el sitio: código, textos y commits.
- **Cada cambio en `firestore.rules` lleva su test** en `tests/rules.test.ts`.
  `src/lib/permisos.ts` es sólo un espejo para esconder botones.
- Altas con `crear()` o `conAuditoria()`: las reglas exigen `creado` (hora del
  servidor) y `creadoPor` (el email de quien escribe).
- Escrituras desde la UI con `useGuardar()`, que avisa si quedó pendiente por
  falta de señal en vez de dejar el botón colgado.
- Fechas `'YYYY-MM-DD'` (ver `src/lib/fechas.ts`); montos en pesos enteros.
- Marca: misma paleta y tipografías que el sitio (ver `BRAND.md` en
  `oasis-club-miramar`). **Ningún hex fuera de `:root`** en `src/styles.css`;
  arena (`--acento`) nunca lleva texto. Verificar con
  `grep -nE "#[0-9a-fA-F]{3,6}" src/styles.css` — sólo el bloque `:root`.

## Despliegue

`npm run deploy` publica reglas y app en producción, con datos reales del
club. **No desplegar sin pedirlo explícitamente.**
