# Roles y permisos en Supabase — Guía paso a paso

Esta guía aplica `roles.sql` en tu proyecto de Supabase. Al terminar:

| Acción | Sin iniciar sesión | Usuario con rol (`superior`, `academico`, `administracion`) |
|---|---|---|
| Ver actividades y archivos | ✅ | ✅ |
| Crear actividades | ✅ | ✅ |
| Subir archivos | ✅ | ✅ |
| Editar actividades, cambiar estado, agregar o borrar notas | ✅ (abierto por ahora, ver "Pendiente") | ✅ |
| **Eliminar actividades** | ❌ | ✅ |
| **Eliminar archivos** (tabla y bucket) | ❌ | ✅ |

> La seguridad la aplica **Supabase** (políticas RLS), no la página. Aunque alguien llame a la API directamente con la clave pública, no podrá borrar.

> **Nunca** pongas la clave `service_role` en `index.html` ni en ningún archivo del repositorio: se salta todas estas reglas.

---

## Paso 1 — Respaldo: revisa lo que hay ahora

1. Entra a <https://supabase.com/dashboard> y abre el proyecto del cronograma.
2. En el menú izquierdo, abre **SQL Editor** y pulsa **New query**.
3. Abre `roles.sql`, copia la consulta **0.1** (sin los `--` del inicio de cada línea), pégala y pulsa **Run**.
4. Guarda el resultado (botón de exportar/CSV o una captura). Son las políticas actuales; el script borrará las de las tablas del cronograma y las del bucket `cronograma-archivos`.
5. Ejecuta igual la consulta **0.5** (archivos huérfanos).
   - Si **no devuelve filas**, sigue al paso 2.
   - Si **devuelve filas**, son registros de archivos cuya actividad ya fue borrada. Anota sus `path`, borra esos archivos en **Storage → cronograma-archivos** (búscalos por nombre y elimínalos), y luego ejecuta la consulta **0.6** para borrar las filas. Si no las limpias, el script se detendrá con un mensaje y no aplicará nada.

## Paso 2 — Crear las 3 cuentas de revisor

En la página, los revisores **no escriben un correo**: escriben un **Usuario** (`superior`, `académico` o `administración`; da igual si usan tildes o mayúsculas). La página lo convierte en un correo interno, así que en Supabase las cuentas deben llamarse **exactamente** así (sin tildes):

| Usuario en la página | Email en Supabase Auth | Rol |
|---|---|---|
| superior | `superior@cronograma.local` | `superior` |
| académico | `academico@cronograma.local` | `academico` |
| administración | `administracion@cronograma.local` | `administracion` |

1. Menú izquierdo: **Authentication → Users**.
2. Pulsa **Add user → Create new user**.
3. Escribe el **email** de la tabla y una **contraseña** segura (mínimo 12 caracteres). No la guardes en ningún archivo del proyecto; entrégala a la persona del cargo por un medio privado.
4. Marca **Auto Confirm User**. Es obligatorio: `cronograma.local` no es un dominio real y nunca llegará un correo de confirmación.
5. Pulsa **Create user** y repite con las otras dos cuentas.

Cada cuenta corresponde a un **cargo**, no a una persona. Ver "Cambiar la persona de un cargo" más abajo.

## Paso 3 — Desactivar el registro público (Sign ups)

Así nadie puede crearse una cuenta por su cuenta.

1. Menú izquierdo: **Authentication → Sign In / Providers** (en algunas versiones del panel está en **Authentication → Settings**).
2. Busca la opción **Allow new users to sign up** y **desactívala**.
3. Pulsa **Save**.

> Aunque alguien lograra registrarse, no tendría fila en `perfiles` y por tanto **no podría borrar**. Desactivar el registro es una capa extra.

## Paso 4 — Ejecutar `roles.sql`

1. **SQL Editor → New query**.
2. Copia **todo** el contenido de `roles.sql` y pégalo.
3. Pulsa **Run**.
4. Resultado esperado: `Success. No rows returned`. En la pestaña de mensajes/notices verás las políticas eliminadas y si se creó la clave foránea con CASCADE.

Si aparece un error:

- **`Hay N fila(s) huérfana(s)…`**: vuelve al paso 1.5, limpia y ejecuta de nuevo. No se aplicó nada.
- **`foreign key constraint … cannot be implemented`** (tipos incompatibles): ejecuta la consulta **0.4**; `activity_id` e `id` deben ser del mismo tipo. Avísame con el resultado.
- **`must be owner of table objects`**: tu proyecto no permite crear políticas de Storage por SQL. Crea las tres políticas a mano en **Storage → Policies → cronograma-archivos** con estas condiciones y vuelve a ejecutar el script sin la sección 4:
  - SELECT, roles `anon, authenticated`: `bucket_id = 'cronograma-archivos'`
  - INSERT, roles `anon, authenticated`: `bucket_id = 'cronograma-archivos'`
  - DELETE, rol `authenticated`: `bucket_id = 'cronograma-archivos' and (select public.es_revisor())`

El script es **idempotente**: puedes ejecutarlo varias veces sin problema.

### Revisa los avisos de Storage

Si en los mensajes aparece `WARNING: Revisa la política de Storage "…"`, existe una política de borrado en `storage.objects` que **no filtra por bucket** y seguiría permitiendo borrar archivos de este bucket. Ve a **Storage → Policies**, busca esa política y elimínala o restríngela a su bucket.

## Paso 5 — Asignar los roles

1. **SQL Editor → New query**.
2. Pega esto tal cual (busca las cuentas por su email, no hace falta copiar UUIDs):

   ```sql
   insert into public.perfiles (id, rol)
   select id,
          case email
            when 'superior@cronograma.local'       then 'superior'
            when 'academico@cronograma.local'      then 'academico'
            when 'administracion@cronograma.local' then 'administracion'
          end
   from auth.users
   where email in ('superior@cronograma.local', 'academico@cronograma.local', 'administracion@cronograma.local')
   on conflict (id) do update set rol = excluded.rol;
   ```

3. Pulsa **Run**: debe decir `3 rows affected`. Comprueba con la consulta **6.3** de `roles.sql`.

Para quitarle el rol a una cuenta, usa la consulta **6.4**.

## Cambiar la persona de un cargo

Las cuentas son del **cargo** (superior, académico, administración), no de la persona. Cuando cambia quien ocupa un cargo **no se crea una cuenta nueva**: se cambia la contraseña de esa cuenta y se le entrega la nueva a la persona entrante.

1. Si tu panel lo permite, en **Authentication → Users** abre la cuenta (por ejemplo `academico@cronograma.local`) y cámbiale la contraseña desde ahí.
2. Si no aparece esa opción, en **SQL Editor → New query** ejecuta lo siguiente, escribiendo la contraseña nueva **solo en el editor** (nunca en un archivo del proyecto):

   ```sql
   update auth.users
   set encrypted_password = extensions.crypt('ESCRIBE-AQUI-LA-NUEVA', extensions.gen_salt('bf')),
       updated_at = now()
   where email = 'academico@cronograma.local';
   ```

   Después **borra esa consulta** del SQL Editor (no la guardes como snippet), para que la contraseña no quede en el historial.
3. **Cierra las sesiones abiertas de la persona saliente.** Cambiar la contraseña no cierra las sesiones que ya tenía iniciadas:

   ```sql
   delete from auth.sessions
   where user_id = (select id from auth.users where email = 'academico@cronograma.local');
   ```

   Su acceso termina como mucho cuando caduque el token que ya tenía (1 hora por defecto).

El rol no cambia: sigue en `perfiles` asociado a la cuenta.

## Paso 6 — Probar que un anónimo ya no puede borrar

> Sin sesión, la página **no muestra** los botones de eliminar. Además, si Supabase rechaza un borrado, la página lo avisa: Supabase no devuelve error, borra 0 filas, y la página lo detecta. Por eso la prueba de verdad se hace desde la consola, que se salta la interfaz.

### Prueba A — Desde la página (sin iniciar sesión)

1. Abre el cronograma **sin iniciar sesión** y crea una actividad llamada `PRUEBA ROLES`.
2. Ábrela y sube un archivo cualquiera.
3. Comprueba que **no aparecen** "🗑️ Eliminar Actividad" ni "Eliminar" en el archivo.

### Prueba B — Desde la consola del navegador (más precisa)

1. En la página del cronograma pulsa **F12 → Consola**.
2. Cambia `123` por el id de `PRUEBA ROLES` (lo ves con `activities` en la consola) y ejecuta:

   ```js
   await supabaseClient.from('cronograma_actividades').delete().eq('id', 123).select()
   ```

   Esperado: `data: []` (0 filas borradas) y `error: null`.

### Prueba C — En el SQL Editor (no borra nada de verdad)

Usa los bloques **6.5** (como anónimo: debe devolver 0 filas) y **6.6** (como usuario con rol: `es_revisor()` = true y 1 fila). Ambos terminan en `rollback`, así que no se borra nada.

### Prueba D — Un revisor sí puede borrar

1. Pulsa **🔐 Acceso revisores** en el encabezado.
2. En **Usuario** escribe `académico` (o `superior` / `administración`; da igual tildes y mayúsculas) y su contraseña.
3. En el encabezado debe aparecer la etiqueta del rol y **Cerrar sesión**, y en las tarjetas los botones de eliminar.
4. Elimina el archivo y luego la actividad `PRUEBA ROLES`. Recarga: ya no deben estar, y el archivo tampoco en **Storage → cronograma-archivos**.
5. Pulsa **Cerrar sesión**: los botones de eliminar desaparecen.

Si sale "Usuario o contraseña incorrectos.", revisa que la cuenta se llame exactamente como en la tabla del paso 2 y que tenga **Auto Confirm User**. Si entras pero la etiqueta dice "Sin rol asignado", falta el paso 5.

---

## Qué hace el CASCADE (y qué no)

El script hace que `cronograma_archivos.activity_id` sea una clave foránea con **ON DELETE CASCADE**: al borrar una actividad, Supabase borra automáticamente sus **filas** en `cronograma_archivos`.

**No borra los archivos del bucket** `cronograma-archivos`. Storage es un sistema aparte y Postgres no puede borrar archivos reales. Por eso la página, al eliminar una actividad, borra **primero** sus archivos del bucket y solo si eso funciona borra la actividad. Si alguien borra una actividad por otra vía (SQL, panel), sus archivos quedan en el bucket y hay que limpiarlos a mano desde **Storage**.

## Pendiente

- **Edición (UPDATE)**: sigue abierta para todos, incluido **borrar notas** y **cambiar estado**, que técnicamente son ediciones. Está marcado con `TODO` en `roles.sql`.
