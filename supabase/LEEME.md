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

## Paso 2 — Crear los 3 usuarios

1. Menú izquierdo: **Authentication → Users**.
2. Pulsa **Add user → Create new user**.
3. Escribe el **email** y una **contraseña** segura. Marca **Auto Confirm User** para que no necesite confirmar el correo.
4. Pulsa **Create user**.
5. Repite para los otros dos usuarios (uno por rol, por ejemplo).
6. En la lista, haz clic en cada usuario y copia su **User UID** (un texto como `3f2a…-…`). Lo necesitarás en el paso 5.

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
2. Pega esto, cambiando cada UUID por el **User UID** copiado en el paso 2, y el rol que corresponda:

   ```sql
   insert into public.perfiles (id, rol) values
     ('UUID-DEL-USUARIO-1', 'superior'),
     ('UUID-DEL-USUARIO-2', 'academico'),
     ('UUID-DEL-USUARIO-3', 'administracion')
   on conflict (id) do update set rol = excluded.rol;
   ```

3. Pulsa **Run**. Comprueba con la consulta **6.3** de `roles.sql`.

Para cambiar el rol de alguien, ejecuta lo mismo con el nuevo rol. Para quitárselo, usa la consulta **6.4**.

## Paso 6 — Probar que un anónimo ya no puede borrar

> Importante: hoy la página **no avisa** cuando Supabase rechaza un borrado. Supabase no devuelve error; simplemente borra 0 filas. Por eso hay que recargar para comprobarlo. Mostrar un mensaje claro será parte de la fase siguiente.

### Prueba A — Desde la página (sin iniciar sesión)

1. Abre el cronograma y crea una actividad llamada `PRUEBA ROLES`.
2. Ábrela y sube un archivo cualquiera.
3. Pulsa **Eliminar** en el archivo y acepta.
4. Pulsa **🗑️ Eliminar Actividad** y acepta.
5. **Recarga la página (F5)**. La actividad y su archivo **deben seguir ahí**.
6. En el panel, **Storage → cronograma-archivos**: el archivo debe seguir ahí.

### Prueba B — Desde la consola del navegador (más precisa)

1. En la página del cronograma pulsa **F12 → Consola**.
2. Cambia `123` por el id de `PRUEBA ROLES` (lo ves con `activities` en la consola) y ejecuta:

   ```js
   await supabaseClient.from('cronograma_actividades').delete().eq('id', 123).select()
   ```

   Esperado: `data: []` (0 filas borradas) y `error: null`.

### Prueba C — En el SQL Editor (no borra nada de verdad)

Usa los bloques **6.5** (como anónimo: debe devolver 0 filas) y **6.6** (como usuario con rol: `es_revisor()` = true y 1 fila). Ambos terminan en `rollback`, así que no se borra nada.

### Prueba D — Un usuario con rol sí puede borrar (opcional)

Todavía no hay pantalla de inicio de sesión. Se puede probar desde la consola (F12) de la página:

```js
await supabaseClient.auth.signInWithPassword({ email: 'correo@ejemplo.com', password: 'su-contraseña' })
await supabaseClient.from('cronograma_actividades').delete().eq('id', 123).select()
// Esperado: data con 1 fila. Luego cierra sesión:
await supabaseClient.auth.signOut()
```

Usa la actividad `PRUEBA ROLES` para no borrar nada importante.

---

## Qué hace el CASCADE (y qué no)

El script hace que `cronograma_archivos.activity_id` sea una clave foránea con **ON DELETE CASCADE**: al borrar una actividad, Supabase borra automáticamente sus **filas** en `cronograma_archivos`.

**No borra los archivos del bucket** `cronograma-archivos`. Storage es un sistema aparte y Postgres no puede borrar archivos reales. En la siguiente fase, la página borrará primero los archivos del bucket y luego la actividad. Mientras tanto, si un revisor borra una actividad con archivos, esos archivos quedan en el bucket y hay que limpiarlos a mano desde **Storage**.

## Pendiente (fases siguientes)

- **Edición (UPDATE)**: sigue abierta para todos, incluido **borrar notas**, que técnicamente es una edición del campo `notes`. Está marcado con `TODO` en `roles.sql`.
- **Página**: pantalla de inicio de sesión, mostrar u ocultar los botones de eliminar según el rol (leyendo `perfiles`), avisar cuando un borrado es rechazado y borrar del bucket los archivos de una actividad antes de eliminarla.
