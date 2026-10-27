-- =====================================================================
-- Cronograma de Actividades — Permisos de edición (fase 2 de RLS)
-- =====================================================================
-- Requiere haber aplicado antes roles.sql (tabla perfiles y función
-- es_revisor()). Se ejecuta completo en el SQL Editor de Supabase
-- (como "postgres"). Es idempotente y va en una sola transacción: si
-- algo falla, no se aplica nada.
--
-- OJO: si vuelves a ejecutar roles.sql, este script se deshace en parte
-- (roles.sql recrea archivos_update, el SELECT abierto del bucket y
-- actividades_insert abierta, con "with check (true)").
-- Ejecuta roles-2.sql otra vez después.
--
-- Reglas que deja vigentes:
--   * Revisores (superior, academico, administracion): editan título,
--     fecha, sedes, responsable y estado, crean con cualquier estado y
--     eliminan (ya lo hacía roles.sql).
--   * Todos, sin sesión: crean actividades (solo con estado
--     'pending'), suben archivos y agregan notas.
--   * PENDIENTE: borrar notas sigue abierto. Agregar y borrar una nota
--     son el mismo UPDATE del campo notes, así que la base no puede
--     distinguirlos. Se blindará moviendo las notas a su propia tabla.
--
-- Antes de ejecutar, revisa la sección 0 (consultas de inspección).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. INSPECCIÓN (opcional, comentado; solo lectura). Ejecuta cada
--    consulta por separado ANTES del script.
-- ---------------------------------------------------------------------

-- 0.1 Longitud máxima actual de cada campo con límite (paso 4).
--     El 2026-10-26 era: title 24, date 23, location 32,
--     responsible 82, notes 610, name 62. Los límites del paso 4 están
--     muy por encima; si algún valor supera su límite, el paso 4 se
--     detendrá con un error (ver 0.2).
-- select 'title' as campo, max(char_length(title)) as maximo from public.cronograma_actividades
-- union all select 'date', max(char_length(date)) from public.cronograma_actividades
-- union all select 'location', max(char_length(location)) from public.cronograma_actividades
-- union all select 'responsible', max(char_length(responsible)) from public.cronograma_actividades
-- union all select 'notes', max(char_length(notes)) from public.cronograma_actividades
-- union all select 'archivos.name', max(char_length(name)) from public.cronograma_archivos;

-- 0.2 Filas que superarían los límites del paso 4 (debe devolver 0 filas).
-- select id, char_length(title) as title, char_length(date) as date,
--        char_length(location) as location, char_length(responsible) as responsible,
--        char_length(notes) as notes
-- from public.cronograma_actividades
-- where char_length(title) > 300 or char_length(date) > 60
--    or char_length(location) > 1000 or char_length(responsible) > 500
--    or char_length(notes) > 50000;
-- select id, char_length(name) as name from public.cronograma_archivos
-- where char_length(name) > 255;

-- 0.3 Rutas (path) duplicadas en cronograma_archivos (debe devolver
--     0 filas; si no, el paso 2 se detendrá con un error).
-- select path, count(*) as veces, array_agg(id order by id) as ids
-- from public.cronograma_archivos
-- group by path
-- having count(*) > 1;

-- 0.4 Políticas actuales (respaldo antes de cambiar nada):
-- select schemaname, tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where (schemaname = 'public' and tablename in ('cronograma_actividades', 'cronograma_archivos'))
--    or (schemaname = 'storage' and tablename = 'objects')
-- order by schemaname, tablename, policyname;

-- 0.5 Estados fuera de la lista del paso 5 (debe devolver 0 filas;
--     si no, el paso 5 se detendrá con un error). El 2026-10-26 solo
--     había 'pending' y 'done'.
-- select id, status
-- from public.cronograma_actividades
-- where status is null or status not in ('pending', 'approved', 'done');


begin;

-- ---------------------------------------------------------------------
-- 1. TRIGGER: quien no es revisor solo puede cambiar "notes"
--    La política actividades_update de roles.sql sigue abierta (las
--    notas las agrega cualquiera); este trigger limita QUÉ columnas
--    cambian. Compara la fila entera sin "notes", así que cubre
--    cualquier columna, también las que se añadan en el futuro.
--
--    Solo vigila a los roles de la API (anon y authenticated, que son
--    los que usa la página con la clave pública). postgres (SQL Editor
--    y Table Editor), service_role y supabase_admin no se bloquean.
--    Es security invoker (por defecto) a propósito: así current_user es
--    el rol real de quien hace el UPDATE.
-- ---------------------------------------------------------------------
create or replace function public.cronograma_actividades_solo_notas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if (to_jsonb(new) - 'notes') is distinct from (to_jsonb(old) - 'notes')
     and not public.es_revisor() then
    raise exception using
      errcode = '42501',
      message = 'Solo los revisores pueden editar la actividad o cambiar su estado. Sin sesión de revisor solo se pueden agregar notas.',
      hint    = 'Inicia sesión con «Acceso revisores».';
  end if;

  return new;
end;
$$;

-- Una función de trigger no se puede llamar directamente; se quita el
-- EXECUTE por defecto para que no aparezca como RPC.
revoke execute on function public.cronograma_actividades_solo_notas() from public, anon, authenticated;

drop trigger if exists cronograma_actividades_solo_notas on public.cronograma_actividades;
create trigger cronograma_actividades_solo_notas
  before update on public.cronograma_actividades
  for each row
  execute function public.cronograma_actividades_solo_notas();


-- ---------------------------------------------------------------------
-- 2. cronograma_archivos: sin UPDATE desde la API y "path" único
--    La página nunca edita esta tabla: solo inserta, lee y (revisores)
--    borra. Sin política ni privilegio de UPDATE, nadie puede cambiar
--    el "path" de una fila para apuntarla a otro archivo.
-- ---------------------------------------------------------------------
drop policy if exists archivos_update on public.cronograma_archivos;
revoke update on table public.cronograma_archivos from anon, authenticated;

do $$
declare
  duplicados integer;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.cronograma_archivos'::regclass
      and conname = 'cronograma_archivos_path_key'
  ) then
    raise notice 'La restricción cronograma_archivos_path_key ya existe.';
    return;
  end if;

  select count(*) into duplicados
  from (
    select path from public.cronograma_archivos
    group by path having count(*) > 1
  ) d;

  if duplicados > 0 then
    raise exception 'Hay % ruta(s) (path) repetida(s) en cronograma_archivos. Revisa la consulta 0.3 y corrígelas antes de volver a ejecutar. No se aplicó ningún cambio.', duplicados;
  end if;

  alter table public.cronograma_archivos
    add constraint cronograma_archivos_path_key unique (path);
  raise notice 'Creada la restricción UNIQUE cronograma_archivos_path_key.';
end $$;


-- ---------------------------------------------------------------------
-- 3. STORAGE: solo los revisores leen storage.objects del bucket
--    Esto controla listar y descargar por la API autenticada. NO afecta:
--      * la URL pública (getPublicUrl): el bucket es público y esas
--        URLs no pasan por RLS; así se siguen abriendo los archivos;
--      * la subida: solo necesita la política de INSERT (sin upsert);
--      * el borrado de los revisores: ellos sí cumplen esta política.
-- ---------------------------------------------------------------------
drop policy if exists cronograma_archivos_storage_select on storage.objects;
create policy cronograma_archivos_storage_select
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'cronograma-archivos' and (select public.es_revisor()));

-- Aviso: políticas de lectura en storage.objects que NO filtran por
-- bucket. Seguirían dejando leer este bucket a cualquiera.
do $$
declare
  p record;
begin
  for p in
    select policyname, cmd, roles, qual
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('SELECT', 'ALL')
      and policyname <> 'cronograma_archivos_storage_select'
      and coalesce(qual, '') not like '%bucket_id%'
  loop
    raise warning 'Revisa la política de Storage "%" (%, roles %): permite leer sin filtrar bucket. Condición: %',
      p.policyname, p.cmd, p.roles, p.qual;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 4. LÍMITES DE LONGITUD (CHECK)
--    Valores generosos muy por encima de lo existente (ver 0.1).
--    char_length cuenta caracteres, no bytes. Un NULL pasa el CHECK.
--    Se crean NOT VALID (no recorren la tabla) y luego VALIDATE las
--    comprueba sobre las filas existentes; si alguna no cumple, el
--    script se detiene y no se aplica nada (ver 0.2).
--    drop + add hace que volver a ejecutar sea seguro y permite
--    cambiar un límite editando solo el número.
-- ---------------------------------------------------------------------
alter table public.cronograma_actividades drop constraint if exists cronograma_actividades_title_longitud;
alter table public.cronograma_actividades add constraint cronograma_actividades_title_longitud
  check (char_length(title) <= 300) not valid;

alter table public.cronograma_actividades drop constraint if exists cronograma_actividades_date_longitud;
alter table public.cronograma_actividades add constraint cronograma_actividades_date_longitud
  check (char_length(date) <= 60) not valid;

alter table public.cronograma_actividades drop constraint if exists cronograma_actividades_location_longitud;
alter table public.cronograma_actividades add constraint cronograma_actividades_location_longitud
  check (char_length(location) <= 1000) not valid;

alter table public.cronograma_actividades drop constraint if exists cronograma_actividades_responsible_longitud;
alter table public.cronograma_actividades add constraint cronograma_actividades_responsible_longitud
  check (char_length(responsible) <= 500) not valid;

alter table public.cronograma_actividades drop constraint if exists cronograma_actividades_notes_longitud;
alter table public.cronograma_actividades add constraint cronograma_actividades_notes_longitud
  check (char_length(notes) <= 50000) not valid;

alter table public.cronograma_archivos drop constraint if exists cronograma_archivos_name_longitud;
alter table public.cronograma_archivos add constraint cronograma_archivos_name_longitud
  check (char_length(name) <= 255) not valid;

alter table public.cronograma_actividades validate constraint cronograma_actividades_title_longitud;
alter table public.cronograma_actividades validate constraint cronograma_actividades_date_longitud;
alter table public.cronograma_actividades validate constraint cronograma_actividades_location_longitud;
alter table public.cronograma_actividades validate constraint cronograma_actividades_responsible_longitud;
alter table public.cronograma_actividades validate constraint cronograma_actividades_notes_longitud;
alter table public.cronograma_archivos   validate constraint cronograma_archivos_name_longitud;


-- ---------------------------------------------------------------------
-- 5. ESTADO: valores válidos y estado inicial al crear
--    El trigger del paso 1 ya impide que quien no es revisor CAMBIE el
--    estado; esto impide que lo ELIJA al crear: sin ser revisor solo
--    se inserta con 'pending'. Un INSERT rechazado da error 42501
--    ("new row violates row-level security policy").
--    Reemplaza la política actividades_insert de roles.sql, que era
--    "with check (true)".
-- ---------------------------------------------------------------------
drop policy if exists actividades_insert on public.cronograma_actividades;
create policy actividades_insert
  on public.cronograma_actividades
  for insert
  to anon, authenticated
  with check (status = 'pending' or (select public.es_revisor()));

-- Solo los tres estados que entiende la página. NULL no pasa (la
-- columna "status" debe tener siempre valor). Ver consulta 0.5.
alter table public.cronograma_actividades drop constraint if exists cronograma_actividades_status_valido;
alter table public.cronograma_actividades add constraint cronograma_actividades_status_valido
  check (status is not null and status in ('pending', 'approved', 'done')) not valid;
alter table public.cronograma_actividades validate constraint cronograma_actividades_status_valido;

commit;


-- =====================================================================
-- 6. VERIFICACIÓN (comentado). Ejecuta cada bloque por separado.
-- =====================================================================

-- 6.1 El trigger existe y está activo (tgenabled = 'O'):
-- select tgname, tgenabled
-- from pg_trigger
-- where tgrelid = 'public.cronograma_actividades'::regclass and not tgisinternal;

-- 6.2 Nadie de la API puede hacer UPDATE en cronograma_archivos
--     (ambas columnas deben ser false):
-- select has_table_privilege('anon', 'public.cronograma_archivos', 'UPDATE') as anon_update,
--        has_table_privilege('authenticated', 'public.cronograma_archivos', 'UPDATE') as auth_update;

-- 6.3 Restricciones creadas (UNIQUE y CHECK):
-- select conrelid::regclass as tabla, conname, convalidated, pg_get_constraintdef(oid) as definicion
-- from pg_constraint
-- where conrelid in ('public.cronograma_actividades'::regclass, 'public.cronograma_archivos'::regclass)
--   and (conname like '%_longitud' or conname in ('cronograma_archivos_path_key', 'cronograma_actividades_status_valido'))
-- order by 1, 2;

-- 6.4 Políticas resultantes (no debe quedar archivos_update; el SELECT
--     del bucket debe ser solo para authenticated con es_revisor(); el
--     with_check de actividades_insert debe mencionar 'pending' y es_revisor()):
-- (usa la consulta 0.4)

-- 6.5 Como anónimo: cambiar el título debe FALLAR con el mensaje del
--     trigger (ERROR 42501). Cambia 123 por un id real. El rollback
--     deshace todo.
-- begin;
--   set local role anon;
--   update public.cronograma_actividades set title = title || ' (prueba)' where id = 123;
-- rollback;

-- 6.6 Como anónimo: cambiar solo las notas debe FUNCIONAR (1 fila).
-- begin;
--   set local role anon;
--   update public.cronograma_actividades set notes = coalesce(notes || E'\n\n', '') || '• prueba'
--   where id = 123 returning id;
-- rollback;

-- 6.7 Como revisor: cambiar título y estado debe FUNCIONAR (1 fila).
--     Cambia el UUID por el de una cuenta con rol (consulta 6.3 de roles.sql).
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
--   select public.es_revisor();  -- debe ser true
--   update public.cronograma_actividades set title = title || ' (prueba)', status = 'done'
--   where id = 123 returning id;
-- rollback;

-- 6.8 Como postgres (SQL Editor, sin "set role"): debe FUNCIONAR.
-- begin;
--   update public.cronograma_actividades set title = title || ' (prueba)' where id = 123 returning id;
-- rollback;

-- 6.9 Límite de longitud: debe FALLAR con ERROR 23514 (check_violation).
-- begin;
--   update public.cronograma_actividades set title = repeat('x', 301) where id = 123;
-- rollback;


-- 6.10 Como anónimo: crear con estado 'approved' debe FALLAR con
--      ERROR 42501 (new row violates row-level security policy).
-- begin;
--   set local role anon;
--   insert into public.cronograma_actividades (title, date, responsible, status)
--   values ('PRUEBA SQL', '01/01/2026', 'Prueba', 'approved');
-- rollback;

-- 6.11 Como anónimo: crear con estado 'pending' debe FUNCIONAR (1 fila;
--      el rollback la deshace).
-- begin;
--   set local role anon;
--   insert into public.cronograma_actividades (title, date, responsible, status)
--   values ('PRUEBA SQL', '01/01/2026', 'Prueba', 'pending');
-- rollback;

-- 6.12 Como revisor: crear con estado 'approved' debe FUNCIONAR (1 fila).
--      Cambia el UUID por el de una cuenta con rol.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
--   select public.es_revisor();  -- debe ser true
--   insert into public.cronograma_actividades (title, date, responsible, status)
--   values ('PRUEBA SQL', '01/01/2026', 'Prueba', 'approved');
-- rollback;

-- 6.13 Estado fuera de la lista: debe FALLAR con ERROR 23514, también
--      como postgres.
-- begin;
--   update public.cronograma_actividades set status = 'otro' where id = 123;
-- rollback;

-- =====================================================================
-- 7. REVERSIÓN (rollback de este script; comentado).
--    Deja todo como lo dejó roles.sql. Copia el bloque completo, quita
--    los "-- " y ejecútalo. También es idempotente.
-- =====================================================================

-- begin;
--
-- -- 1. Trigger
-- drop trigger if exists cronograma_actividades_solo_notas on public.cronograma_actividades;
-- drop function if exists public.cronograma_actividades_solo_notas();
--
-- -- 2. UPDATE en cronograma_archivos y UNIQUE en path
-- grant update on table public.cronograma_archivos to anon, authenticated;
-- drop policy if exists archivos_update on public.cronograma_archivos;
-- create policy archivos_update
--   on public.cronograma_archivos
--   for update
--   to anon, authenticated
--   using (true)
--   with check (true);
-- alter table public.cronograma_archivos drop constraint if exists cronograma_archivos_path_key;
--
-- -- 3. SELECT abierto en el bucket
-- drop policy if exists cronograma_archivos_storage_select on storage.objects;
-- create policy cronograma_archivos_storage_select
--   on storage.objects
--   for select
--   to anon, authenticated
--   using (bucket_id = 'cronograma-archivos');
--
-- -- 4. Límites de longitud
-- alter table public.cronograma_actividades drop constraint if exists cronograma_actividades_title_longitud;
-- alter table public.cronograma_actividades drop constraint if exists cronograma_actividades_date_longitud;
-- alter table public.cronograma_actividades drop constraint if exists cronograma_actividades_location_longitud;
-- alter table public.cronograma_actividades drop constraint if exists cronograma_actividades_responsible_longitud;
-- alter table public.cronograma_actividades drop constraint if exists cronograma_actividades_notes_longitud;
-- alter table public.cronograma_archivos   drop constraint if exists cronograma_archivos_name_longitud;
--
-- -- 5. INSERT abierto (como en roles.sql) y sin CHECK de estado
-- drop policy if exists actividades_insert on public.cronograma_actividades;
-- create policy actividades_insert
--   on public.cronograma_actividades
--   for insert
--   to anon, authenticated
--   with check (true);
-- alter table public.cronograma_actividades drop constraint if exists cronograma_actividades_status_valido;
--
-- commit;
