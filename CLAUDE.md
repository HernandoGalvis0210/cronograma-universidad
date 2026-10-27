# Cronograma de Actividades — Representación estudiantil

Cronograma web para que una representación estudiantil planifique actividades, asigne responsables, registre notas/enlaces y adjunte archivos. Es un frontend estático (HTML, CSS y módulos ES nativos, sin compilación; Vercel sirve los archivos tal cual) que usa **Supabase** como backend (Postgres + Storage + Realtime).

## Cómo ejecutarlo

No hay build ni dependencias locales. `supabase-js` se carga desde jsDelivr con versión **exacta** (`@2.118.0`, en el `<head>` de `index.html`); para actualizarla, cambiar el número a propósito y probar.

- Los módulos ES **no cargan desde `file://`** (abrir `index.html` con doble clic deja la página en el splash). Hay que servirlo: `python -m http.server 8080` y abrir `http://localhost:8080`. En Windows ese servidor solo encola 5 conexiones y, de vez en cuando, rechaza alguna de las peticiones en paralelo (CSS, módulos, logo): si falla un módulo, a los 8 s sale el aviso de la red de seguridad; basta con recargar. En Vercel no pasa.
- Requiere conexión a internet (CDN y proyecto Supabase).

## Estructura

```
index.html        HTML, precarga del logo y de los módulos, capa mínima del splash en línea
assets/logo.png   logo del splash (precargado con rel=preload)
css/
  variables.css   paleta, tema claro (:root) y oscuro (body.dark-mode), radios, sombras, estados
  base.css        caja, body, header, contenedor, botones, campos y foco
  splash.css      animaciones de entrada y salida del splash
  componentes.css filtros, resumen, línea de tiempo, tarjetas, notas, archivos, modales, acceso
  responsive.css  media queries 1024/768/480/390/360 px (siempre la última)
js/
  config.js       cliente de Supabase, isPermissionError, errorMessage, runWrite
  estado.js       constantes (subida, mensajes, textos) y objeto `estado` compartido
  auth.js         acceso de revisores, sesión, rol, isReviewer/canDelete/canEdit
  actividades.js  fetchData, saveActivity, deleteActivity, changeStatus, activityDateValue
  archivos.js     validación y subida, fileHTML, abrir y borrar, removeFromBucket
  notas.js        renderNotesLog, appendNote, deleteNote
  ui.js           icon, tema, render, filtros, modal de actividad, iniciarInterfaz (eventos)
  main.js         arranque: splash, tema guardado, onAuthStateChange, realtime, primera carga
supabase/         SQL de roles y RLS + guía (se aplica a mano en el panel)
```

- Los CSS se enlazan en el orden de arriba: el orden importa en la cascada.
- En el `<head>` va en línea solo la capa base del splash (`.splash`, `.splash-logo`, `body.splash-active` y `@keyframes splash-respaldo`) para que tape la página desde el primer pintado; el resto está en `splash.css`.
- **Red de seguridad del arranque** (script ES5 en línea en el `<head>`, junto a los estilos de `.fallo-arranque`): si a los 8 s desde el inicio `main.js` no se ha ejecutado (falló un módulo, la CDN de supabase-js o la red), oculta el splash y pone en `<main>` el aviso `role="alert"` "No se pudo cargar la aplicación. Revisa tu conexión y recarga la página." con el botón "Recargar". La primera línea ejecutable de `main.js` llama a `window.cancelarRedDeArranque()`: cancela el temporizador y, si la aplicación llegó tarde, quita el aviso. Oculta el splash (no lo elimina) para que el script del splash lo encuentre si llega a ejecutarse. No depender de módulos ni de supabase-js dentro de ese script.
- Splash:
  - Tiempos en las constantes `TIEMPOS` (entrada 600 / permanencia 1200 / salida 700 ms) y `TIEMPOS_REDUCIDOS` (500 / 700 / 300 ms, solo fundido) al inicio de `js/main.js`. Cuentan desde que el logo se decodifica (`logo.decode()`, máx. `ESPERA_MAX_LOGO`), nunca desde `load` ni Supabase.
  - Con `prefers-reduced-motion` el splash **no se quita**: se muestra sin escalado. Al terminar se elimina del DOM; `splash-respaldo` (CSS) lo oculta a los 8 s si el script fallara. Es `aria-hidden`.
- HTML: header, toolbar de filtros, stats, `#timeline`, modales `#activityModal` y `#loginModal`.
- Módulos: el estado que antes eran variables globales (`activities`, `filesData`, `currentFilter`, `editingId`, `openCards`, `currentSession`, `currentRole`…) vive en `estado` (`estado.activities`, etc.). Las importaciones circulares entre módulos son intencionadas y seguras: ningún módulo usa otro al evaluarse, solo dentro de funciones; los efectos de arranque están en `main.js`.
- `window.supabaseClient` y `window.activities` (solo lectura) existen a propósito para las pruebas de consola de `supabase/LEEME.md`.

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
Bucket `cronograma-archivos` (público: los archivos se abren con `getPublicUrl`, que no pasa por RLS; listar/descargar por la API solo revisores). Subida validada en la página con las constantes de `js/estado.js`: `MAX_UPLOAD_MB` (10), `ALLOWED_UPLOAD_TYPES` (extensión → MIME: PDF, Word, Excel, PowerPoint, JPG, PNG, WebP) y `MAX_FILE_NAME_LENGTH`; `uploadErrorMessage()` traduce los rechazos del bucket (413/415). Recomendado configurar el mismo límite en el bucket (LEEME, paso F2.3).

### Realtime
Canal `realtime_sync` escucha `*` en ambas tablas y vuelve a llamar a `fetchData()`.

## Convenciones

- Todo en **español**: textos de UI, comentarios, mensajes de commit y nombres nuevos cuando tenga sentido (los existentes mezclan inglés: `activities`, `render`, etc.; respetarlos).
- **Sin compilación**: CSS en `css/` y JS en módulos ES de `js/` según el mapa de Estructura; nada de bundlers, frameworks ni dependencias npm. Un archivo nuevo de JS se importa desde el módulo que lo usa y se añade su `<link rel="modulepreload">` en `index.html`.
- Usar las **variables CSS existentes** (`--primary`, `--secondary`, `--brand-crimson`, `--card`, `--border`, `--radius-*`, `--shadow-*`, `--pending/approved/done(-bg)`, etc.) en lugar de colores fijos, para que funcionen en tema claro y oscuro (`body.dark-mode`).
- Identidad: dorado (`--brand-gold`), azul marino (`--brand-navy`), carmesí (`--brand-crimson`) para acciones destructivas.
- Sin emojis en la interfaz (textos, `title`/`aria-label`, mensajes): texto sobrio. Si un icono aporta, usar `icon('sede'|'persona'|'archivo'|'sol'|'luna')` (SVG de línea de `ICONOS`, `currentColor`, `aria-hidden`); un botón solo con icono lleva `aria-label` y `title`.
- Estilo de código: CSS compacto en una línea por regla; JS sin framework, `async/await` con `supabaseClient`. **No hay `onclick`/`onchange` en línea** (con módulos no ven las funciones): todo control lleva `data-action` y lo despacha un listener delegado (ver abajo).
- Al insertar datos en HTML usar siempre `escapeHtml()`. Los controles llevan `data-action` (+ `data-id` numérico en las tarjetas) y los despachan dos listeners delegados de `iniciarInterfaz()` en `js/ui.js`: el de `#timeline` (tarjetas) y el de `document` (tema, Nueva actividad, Cancelar/Guardar del formulario). Para nuevas acciones, añadir un `case` ahí en lugar de interpolar datos en atributos.

## Fases

Cumplidas:
1. Diagnóstico.
2. Sistema visual institucional (dorado, azul marino, carmesí; tema claro/oscuro).
3. Tarjetas y línea de tiempo.
4. Splash institucional.
5. Responsive + actividades completadas (filtro "Completadas"). La regla de que "Todas" ocultaba las `done` quedó reemplazada en la fase 10.

Fusionadas en `main` (el SQL de 7 y 9 hay que aplicarlo a mano en el panel):
6. Autenticación: modal "Acceso revisores" (`signInWithPassword`), sesión restaurada con `getSession` y `onAuthStateChange`. ✅ cliente.
   - Se entra con **Usuario**, no correo: `superior`, `académico` o `administración` (`normalizeUser()` ignora tildes, mayúsculas y espacios). `reviewerEmail()` lo convierte en `<usuario>@cronograma.local`; un usuario desconocido no llega a Supabase y recibe el mismo "Usuario o contraseña incorrectos.".
   - Cuentas en Supabase Auth: `superior@cronograma.local`, `academico@cronograma.local`, `administracion@cronograma.local`, creadas con "Auto Confirm User" (el dominio no recibe correo). Son cuentas por **cargo**: al cambiar la persona se cambia la contraseña y se cierran sus sesiones (pasos en `supabase/LEEME.md`).
   - Nunca escribir contraseñas ni claves (`service_role`) en archivos del repo.
7. Roles y permisos: `supabase/roles.sql` (hay que aplicarlo en el panel) + rol leído de `perfiles` en cada cambio de sesión. ✅ cliente.
8. Restricción de eliminación: botones solo si `canDelete()`; la RLS es la que decide.
9. Permisos de edición: `supabase/roles-2.sql` (hay que aplicarlo en el panel). En la página, el selector de estado, "Editar actividad" y el campo Estado del formulario solo se renderizan si `canEdit()`; sin rol las actividades nuevas se crean `pending`. Enlaces `target="_blank"` con `rel="noopener noreferrer"`. Validación de subida y `maxlength` en los campos. Pendiente: borrar notas (mover las notas a su propia tabla).
10. Filtro "Todas": muestra **todas** las actividades, también las completadas (reemplaza la decisión de la fase 5). Pendientes, Aprobadas y Completadas filtran solo su estado. El primer contador del resumen se llama "Todas" y es `activities.length` = Pendientes + Aprobadas + Completadas. Orden de la línea de tiempo: por fecha (`activityDateValue`), sin agrupar por estado.

En curso (rama `refactor/estructura`, sin cambios de comportamiento ni de aspecto):
11. Reorganización en carpetas (ver Estructura): logo a `assets/`, CSS a `css/`, JS a módulos ES en `js/`, `onclick` en línea sustituidos por `data-action` con delegación, supabase-js fijado a 2.118.0 y `.gitignore`.

Patrones del cliente para escrituras:
- `runWrite(query, mensaje)`: añade `.select('id')` y avisa si hubo error o si se afectaron 0 filas (la RLS rechaza UPDATE/DELETE sin dar error).
- Tras crear, editar o eliminar una actividad con éxito se llama a `fetchData()` para que la vista cambie al instante sin depender de Realtime; `changeStatus` actualiza el estado local y vuelve a renderizar.
- `removeFromBucket(paths)`: borra de Storage y comprueba en la URL pública lo que no se devolvió como borrado; siempre antes de borrar filas.
- `errorMessage(error, mensaje)`: mensaje amable para errores de permisos (`42501` —también el del trigger—, 401/403, RLS) y para textos demasiado largos (`23514`).
- El rol nunca se guarda en `localStorage`; `isReviewer()` / `canDelete()` / `canEdit()` solo deciden qué se muestra. Cada acción restringida también comprueba su función antes de llamar a Supabase.
