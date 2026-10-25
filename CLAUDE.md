# Cronograma de Actividades — Representación estudiantil

Cronograma web para que una representación estudiantil planifique actividades, asigne responsables, registre notas/enlaces y adjunte archivos. Es un frontend estático de **un solo archivo** (`index.html`) que usa **Supabase** como backend (Postgres + Storage + Realtime).

## Cómo ejecutarlo

No hay build ni dependencias locales. `supabase-js@2` se carga desde jsDelivr.

- Rápido: abrir `index.html` en el navegador.
- Recomendado (evita problemas de `file://`): servirlo localmente, p. ej. `python -m http.server 8080` o `npx serve .`, y abrir `http://localhost:8080`.
- Requiere conexión a internet (CDN y proyecto Supabase).

## Estructura de `index.html`

- `<style>` (≈ líneas 7–222): variables CSS en `:root`, overrides en `body.dark-mode`, componentes y media queries (1024/768/480/390/360 px).
- Splash institucional (≈ líneas 226–242). **La línea del `<img class="splash-logo">` contiene un PNG en base64 de ~475 KB: no imprimirla ni leerla completa** (usar `cut`/`awk` o leer por rangos que la excluyan).
- HTML: header, toolbar de filtros, stats, `#timeline`, modal `#activityModal`.
- `<script>` principal: tema, cliente Supabase, `fetchData`, suscripción realtime, CRUD de actividades, notas y archivos, `render()`.

## Supabase

Cliente creado con `createClient(supabaseUrl, supabaseKey)` usando la clave **publishable** (anon). Actualmente no hay autenticación: todas las operaciones se hacen como rol `anon`, así que la seguridad real depende solo de las políticas RLS configuradas en el panel de Supabase (no versionadas en este repo).

### Tabla `cronograma_actividades`
Campos usados por el código (inferidos; se lee con `select('*')`):

| Campo | Uso |
|---|---|
| `id` | numérico, PK; orden de lectura (`order('id')`) |
| `title` | texto, obligatorio en el formulario |
| `date` | texto `dd/mm/aaaa` o `dd/mm/aaaa - dd/mm/aaaa` |
| `location` | texto opcional (sedes / desglose de fechas) |
| `responsible` | texto, obligatorio |
| `status` | `pending` \| `approved` \| `done` |
| `notes` | texto o `null`; entradas `• texto` separadas por `\n\n` |

### Tabla `cronograma_archivos`
| Campo | Uso |
|---|---|
| `id` | PK |
| `activity_id` | referencia a `cronograma_actividades.id` |
| `name` | nombre original del archivo |
| `path` | nombre en Storage (`<timestamp>_<aleatorio>.<ext>`) |
| `type` | MIME type |

### Roles y RLS
`supabase/roles.sql` (se ejecuta a mano en el SQL Editor; guía en `supabase/LEEME.md`): tabla `perfiles (id → auth.users, rol)`, función `es_revisor()` y políticas: select/insert abiertos, update abierto (TODO), delete solo `es_revisor()` en ambas tablas y en el bucket. FK `activity_id` con ON DELETE CASCADE (no borra archivos del bucket). Nunca usar la clave `service_role` en el repo.

### Storage
Bucket `cronograma-archivos` (público: los archivos se abren con `getPublicUrl`).

### Realtime
Canal `realtime_sync` escucha `*` en ambas tablas y vuelve a llamar a `fetchData()`.

## Convenciones

- Todo en **español**: textos de UI, comentarios, mensajes de commit y nombres nuevos cuando tenga sentido (los existentes mezclan inglés: `activities`, `render`, etc.; respetarlos).
- **Un solo archivo**: no separar CSS/JS en archivos aparte ni introducir bundlers/frameworks.
- Usar las **variables CSS existentes** (`--primary`, `--secondary`, `--brand-crimson`, `--card`, `--border`, `--radius-*`, `--shadow-*`, `--pending/approved/done(-bg)`, etc.) en lugar de colores fijos, para que funcionen en tema claro y oscuro (`body.dark-mode`).
- Identidad: dorado (`--brand-gold`), azul marino (`--brand-navy`), carmesí (`--brand-crimson`) para acciones destructivas.
- Estilo de código: CSS compacto en una línea por regla; JS sin framework, handlers `onclick` inline, `async/await` con `supabaseClient`.
- Al insertar datos en HTML usar siempre `escapeHtml()`. En las tarjetas no se usan `onclick`/`onchange` inline: los botones llevan `data-action` + `data-id` (ids numéricos) y un listener delegado en `#timeline` despacha la acción. Para nuevas acciones, añadir un `case` ahí en lugar de interpolar datos en atributos.

## Fases

Cumplidas:
1. Diagnóstico.
2. Sistema visual institucional (dorado, azul marino, carmesí; tema claro/oscuro).
3. Tarjetas y línea de tiempo.
4. Splash institucional.
5. Responsive + actividades completadas (la vista "Todas" oculta las `done`; filtro "Completadas").

En curso (rama `feature/roles`):
6. Autenticación: modal "Acceso revisores" (`signInWithPassword`), sesión restaurada con `getSession` y `onAuthStateChange`. ✅ cliente.
7. Roles y permisos: `supabase/roles.sql` (hay que aplicarlo en el panel) + rol leído de `perfiles` en cada cambio de sesión. ✅ cliente.
8. Restricción de eliminación: botones solo si `canDelete()`; la RLS es la que decide. Pendiente: decidir quién puede editar y borrar notas (UPDATE sigue abierto).

Patrones del cliente para escrituras:
- `runWrite(query, mensaje)`: añade `.select('id')` y avisa si hubo error o si se afectaron 0 filas (la RLS rechaza UPDATE/DELETE sin dar error).
- `removeFromBucket(paths)`: borra de Storage y comprueba en la URL pública lo que no se devolvió como borrado; siempre antes de borrar filas.
- `errorMessage(error, mensaje)`: mensaje amable para errores de permisos (`42501`, 401/403, RLS).
- El rol nunca se guarda en `localStorage`; `canDelete()` solo decide qué se muestra.
