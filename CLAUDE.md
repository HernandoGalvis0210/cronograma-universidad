# Cronograma de Actividades — Representación estudiantil

Cronograma web para que una representación estudiantil planifique actividades, asigne responsables, registre notas/enlaces y adjunte archivos. Es un frontend estático de **un solo archivo** (`index.html`) que usa **Supabase** como backend (Postgres + Storage + Realtime).

## Cómo ejecutarlo

No hay build ni dependencias locales. `supabase-js@2` se carga desde jsDelivr.

- Rápido: abrir `index.html` en el navegador.
- Recomendado (evita problemas de `file://`): servirlo localmente, p. ej. `python -m http.server 8080` o `npx serve .`, y abrir `http://localhost:8080`.
- Requiere conexión a internet (CDN y proyecto Supabase).

## Estructura de `index.html`

- `<style>` (≈ líneas 7–222): variables CSS en `:root`, overrides en `body.dark-mode`, componentes y media queries (1024/768/480/390/360 px).
- Splash institucional (justo después de `<body>`). **La línea del `<img class="splash-logo">` contiene un PNG en base64 de ~475 KB: no imprimirla ni leerla completa** (usar `cut`/`awk` o leer por rangos que la excluyan).
  - Tiempos en las constantes `TIEMPOS` (entrada 600 / permanencia 1200 / salida 700 ms) y `TIEMPOS_REDUCIDOS` (500 / 700 / 300 ms, solo fundido) del script del splash. Cuentan desde que el logo se decodifica (`logo.decode()`, máx. `ESPERA_MAX_LOGO`), nunca desde `load` ni Supabase.
  - Con `prefers-reduced-motion` el splash **no se quita**: se muestra sin escalado. Al terminar se elimina del DOM; `splash-respaldo` (CSS) lo oculta a los 8 s si el script fallara. Es `aria-hidden`.
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
Se ejecutan a mano en el SQL Editor, en orden (guía en `supabase/LEEME.md`). Si se vuelve a ejecutar `roles.sql`, hay que ejecutar `roles-2.sql` otra vez. Nunca usar la clave `service_role` en el repo.

- `supabase/roles.sql`: tabla `perfiles (id → auth.users, rol)`, función `es_revisor()` y políticas: select/insert abiertos, update de actividades abierto (lo limita el trigger de `roles-2.sql`), delete solo `es_revisor()` en ambas tablas y en el bucket. FK `activity_id` con ON DELETE CASCADE (no borra archivos del bucket).
- `supabase/roles-2.sql`: trigger BEFORE UPDATE `cronograma_actividades_solo_notas` (quien no es revisor solo cambia `notes`; si no, error `42501`; no afecta a `postgres` ni `service_role`). `cronograma_archivos` sin UPDATE (ni política ni privilegio) y `UNIQUE (path)`. SELECT de `storage.objects` del bucket solo para revisores. CHECK de longitud (caracteres): `title` 300, `date` 60, `location` 1000, `responsible` 500, `notes` 50 000, `cronograma_archivos.name` 255 (error `23514`). Política `actividades_insert` reemplazada: `with check (status = 'pending' or es_revisor())` (si no, `42501`); CHECK `status in ('pending','approved','done')`, no nulo. Trae consultas de verificación y reversión comentadas. `roles.sql` recrea `actividades_insert` abierta.

Permisos vigentes:

| Acción | Todos (sin sesión) | Revisores |
|---|---|---|
| Ver, subir y abrir archivos, agregar notas | ✅ | ✅ |
| Crear actividades | ✅ solo `pending` (RLS) | ✅ cualquier estado |
| Borrar notas | ✅ (pendiente: mover notas a su propia tabla) | ✅ |
| Editar título/fecha/sedes/responsable, cambiar estado | ❌ | ✅ |
| Eliminar actividades y archivos | ❌ | ✅ |

### Storage
Bucket `cronograma-archivos` (público: los archivos se abren con `getPublicUrl`, que no pasa por RLS; listar/descargar por la API solo revisores). Subida validada en la página con las constantes del inicio del script principal: `MAX_UPLOAD_MB` (10), `ALLOWED_UPLOAD_TYPES` (extensión → MIME: PDF, Word, Excel, PowerPoint, JPG, PNG, WebP) y `MAX_FILE_NAME_LENGTH`; `uploadErrorMessage()` traduce los rechazos del bucket (413/415). Recomendado configurar el mismo límite en el bucket (LEEME, paso F2.3).

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
   - Se entra con **Usuario**, no correo: `superior`, `académico` o `administración` (`normalizeUser()` ignora tildes, mayúsculas y espacios). `reviewerEmail()` lo convierte en `<usuario>@cronograma.local`; un usuario desconocido no llega a Supabase y recibe el mismo "Usuario o contraseña incorrectos.".
   - Cuentas en Supabase Auth: `superior@cronograma.local`, `academico@cronograma.local`, `administracion@cronograma.local`, creadas con "Auto Confirm User" (el dominio no recibe correo). Son cuentas por **cargo**: al cambiar la persona se cambia la contraseña y se cierran sus sesiones (pasos en `supabase/LEEME.md`).
   - Nunca escribir contraseñas ni claves (`service_role`) en archivos del repo.
7. Roles y permisos: `supabase/roles.sql` (hay que aplicarlo en el panel) + rol leído de `perfiles` en cada cambio de sesión. ✅ cliente.
8. Restricción de eliminación: botones solo si `canDelete()`; la RLS es la que decide.

En curso (rama `feature/permisos-edicion`):
9. Permisos de edición: `supabase/roles-2.sql` (hay que aplicarlo en el panel). En la página, el selector de estado, "✏️ Editar Actividad" y el campo Estado del formulario solo se renderizan si `canEdit()`; sin rol las actividades nuevas se crean `pending`. Enlaces `target="_blank"` con `rel="noopener noreferrer"`. Validación de subida y `maxlength` en los campos. Pendiente: borrar notas (mover las notas a su propia tabla).

Patrones del cliente para escrituras:
- `runWrite(query, mensaje)`: añade `.select('id')` y avisa si hubo error o si se afectaron 0 filas (la RLS rechaza UPDATE/DELETE sin dar error).
- `removeFromBucket(paths)`: borra de Storage y comprueba en la URL pública lo que no se devolvió como borrado; siempre antes de borrar filas.
- `errorMessage(error, mensaje)`: mensaje amable para errores de permisos (`42501` —también el del trigger—, 401/403, RLS) y para textos demasiado largos (`23514`).
- El rol nunca se guarda en `localStorage`; `isReviewer()` / `canDelete()` / `canEdit()` solo deciden qué se muestra. Cada acción restringida también comprueba su función antes de llamar a Supabase.
