-- =====================================================================
-- Cronograma de Actividades — Roles y permisos (RLS)
-- =====================================================================
-- Se ejecuta completo en el SQL Editor de Supabase (como "postgres").
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- Todo va en una transacción: si algo falla, no se aplica nada.
--
-- Reglas:
--   * Cualquiera (anon o authenticated) puede VER y CREAR actividades,
--     VER y SUBIR archivos.
--   * Solo perfiles con rol 'superior', 'academico' o 'administracion'
--     pueden ELIMINAR actividades y archivos (tablas y Storage).
--   * UPDATE sigue abierto como hoy (TODO).
--
-- Antes de ejecutar, revisa la sección 0 (consultas de inspección).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. INSPECCIÓN (opcional, comentado). Ejecuta cada consulta por
--    separado ANTES del script y guarda el resultado como respaldo.
-- ---------------------------------------------------------------------

-- 0.1 Políticas actuales de las tablas del cronograma y de Storage:
-- select schemaname, tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where (schemaname = 'public' and tablename in ('cronograma_actividades', 'cronograma_archivos', 'perfiles'))
--    or (schemaname = 'storage' and tablename = 'objects')
-- order by schemaname, tablename, policyname;

-- 0.2 ¿Está RLS activado en las tablas?
-- select relname, relrowsecurity
-- from pg_class
-- where oid in ('public.cronograma_actividades'::regclass, 'public.cronograma_archivos'::regclass);

-- 0.3 ¿Existe la clave foránea activity_id y tiene ON DELETE CASCADE?
--     confdeltype: 'c' = CASCADE, 'a' = NO ACTION, 'r' = RESTRICT,
--                  'n' = SET NULL, 'd' = SET DEFAULT. Sin filas = no existe.
-- select c.conname, c.confdeltype, pg_get_constraintdef(c.oid) as definicion
-- from pg_constraint c
-- where c.contype = 'f'
--   and c.conrelid = 'public.cronograma_archivos'::regclass;

-- 0.4 Tipos de las columnas (activity_id debe ser del mismo tipo que id):
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and ((table_name = 'cronograma_actividades' and column_name = 'id')
--     or (table_name = 'cronograma_archivos' and column_name = 'activity_id'));

-- 0.5 Filas huérfanas: archivos cuya actividad ya no existe.
--     Si devuelve filas, el paso 5 se detendrá con un error hasta que
--     las limpies (ver 0.6).
-- select f.id, f.activity_id, f.name, f.path
-- from public.cronograma_archivos f
-- where f.activity_id is not null
--   and not exists (select 1 from public.cronograma_actividades a where a.id = f.activity_id);

-- 0.6 Limpieza de huérfanas (¡irreversible!). Antes, anota los "path"
--     de 0.5 y borra esos archivos desde Storage > cronograma-archivos
--     en el panel: borrar la fila NO borra el archivo del bucket.
-- delete from public.cronograma_archivos f
-- where f.activity_id is not null
--   and not exists (select 1 from public.cronograma_actividades a where a.id = f.activity_id);


begin;

-- ---------------------------------------------------------------------
-- 1. TABLA perfiles
--    Un perfil por usuario de Supabase Auth con su rol.
--    El cliente solo puede leer su propio perfil; nadie la modifica
--    desde el cliente (se administra desde el SQL Editor).
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id  uuid primary key references auth.users (id) on delete cascade,
  rol text not null check (rol in ('superior', 'academico', 'administracion'))
);

alter table public.perfiles enable row level security;

-- Supabase da permisos amplios por defecto a anon/authenticated en
-- tablas nuevas de "public": se recortan para que solo quede lectura.
revoke all on table public.perfiles from anon;
revoke insert, update, delete, truncate, references, trigger on table public.perfiles from authenticated;
grant select on table public.perfiles to authenticated;

drop policy if exists perfiles_select_propio on public.perfiles;
create policy perfiles_select_propio
  on public.perfiles
  for select
  to authenticated
  using ((select auth.uid()) = id);
-- Sin políticas de insert/update/delete: desde el cliente no se puede.


-- ---------------------------------------------------------------------
-- 2. FUNCIÓN es_revisor()
--    true si el usuario actual tiene un perfil con alguno de los roles.
--    security definer: lee perfiles aunque el que llama no tenga
--    permiso; search_path vacío para que no se pueda suplantar nada.
-- ---------------------------------------------------------------------
create or replace function public.es_revisor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = (select auth.uid())
      and p.rol in ('superior', 'academico', 'administracion')
  );
$$;

revoke execute on function public.es_revisor() from public;
-- anon también la necesita: las políticas se evalúan con su rol
-- (para anon auth.uid() es null y la función devuelve false).
grant execute on function public.es_revisor() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. POLÍTICAS de cronograma_actividades y cronograma_archivos
-- ---------------------------------------------------------------------
alter table public.cronograma_actividades enable row level security;
alter table public.cronograma_archivos   enable row level security;

-- 3.0 Eliminar TODAS las políticas previas de estas dos tablas.
--     Las políticas permisivas se suman con OR: si quedara una antigua
--     tipo "FOR ALL USING (true)", cualquiera seguiría pudiendo borrar.
--     (Estas tablas solo las usa el cronograma.)
do $$
declare
  p record;
begin
  for p in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('cronograma_actividades', 'cronograma_archivos')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
    raise notice 'Política eliminada: public.% -> %', p.tablename, p.policyname;
  end loop;
end $$;

-- 3.1 cronograma_actividades
drop policy if exists actividades_select on public.cronograma_actividades;
create policy actividades_select
  on public.cronograma_actividades
  for select
  to anon, authenticated
  using (true);

drop policy if exists actividades_insert on public.cronograma_actividades;
create policy actividades_insert
  on public.cronograma_actividades
  for insert
  to anon, authenticated
  with check (true);

-- TODO: decidir quién puede editar. Hoy replica el comportamiento
-- abierto: cualquiera edita título, fecha, estado y notas (borrar una
-- nota también es un UPDATE del campo notes).
drop policy if exists actividades_update on public.cronograma_actividades;
create policy actividades_update
  on public.cronograma_actividades
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists actividades_delete on public.cronograma_actividades;
create policy actividades_delete
  on public.cronograma_actividades
  for delete
  to authenticated
  using ((select public.es_revisor()));

-- 3.2 cronograma_archivos
drop policy if exists archivos_select on public.cronograma_archivos;
create policy archivos_select
  on public.cronograma_archivos
  for select
  to anon, authenticated
  using (true);

drop policy if exists archivos_insert on public.cronograma_archivos;
create policy archivos_insert
  on public.cronograma_archivos
  for insert
  to anon, authenticated
  with check (true);

-- TODO: decidir quién puede editar filas de archivos (hoy el cliente
-- no las edita). Se deja abierto como estaba.
drop policy if exists archivos_update on public.cronograma_archivos;
create policy archivos_update
  on public.cronograma_archivos
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists archivos_delete on public.cronograma_archivos;
create policy archivos_delete
  on public.cronograma_archivos
  for delete
  to authenticated
  using ((select public.es_revisor()));


-- ---------------------------------------------------------------------
-- 4. POLÍTICAS de storage.objects para el bucket cronograma-archivos
--    No se tocan políticas de otros buckets.
-- ---------------------------------------------------------------------

-- 4.0 Eliminar políticas previas que mencionen este bucket.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (coalesce(qual, '') like '%cronograma-archivos%'
        or coalesce(with_check, '') like '%cronograma-archivos%')
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
    raise notice 'Política de Storage eliminada: %', p.policyname;
  end loop;
end $$;

drop policy if exists cronograma_archivos_storage_select on storage.objects;
create policy cronograma_archivos_storage_select
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'cronograma-archivos');

drop policy if exists cronograma_archivos_storage_insert on storage.objects;
create policy cronograma_archivos_storage_insert
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'cronograma-archivos');

drop policy if exists cronograma_archivos_storage_delete on storage.objects;
create policy cronograma_archivos_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'cronograma-archivos' and (select public.es_revisor()));

-- 4.1 Aviso: políticas de borrado en storage.objects que NO filtran por
--     bucket. Esas permitirían borrar en cualquier bucket, incluido
--     este, y hay que revisarlas a mano (ver LEEME, paso 5).
do $$
declare
  p record;
begin
  for p in
    select policyname, cmd, roles, qual
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('DELETE', 'ALL')
      and policyname <> 'cronograma_archivos_storage_delete'
      and coalesce(qual, '') not like '%bucket_id%'
  loop
    raise warning 'Revisa la política de Storage "%" (%, roles %): permite borrar sin filtrar bucket. Condición: %',
      p.policyname, p.cmd, p.roles, p.qual;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 5. ARCHIVOS HUÉRFANOS: clave foránea con ON DELETE CASCADE
--    Al borrar una actividad se borran sus filas en cronograma_archivos.
--    OJO: CASCADE NO borra los archivos del bucket; eso lo hará el
--    cliente en la siguiente fase.
-- ---------------------------------------------------------------------
do $$
declare
  fk record;
  tiene_cascade boolean := false;
  huerfanas integer;
begin
  for fk in
    select c.conname, c.confdeltype
    from pg_constraint c
    join pg_attribute att
      on att.attrelid = c.conrelid and att.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.conrelid  = 'public.cronograma_archivos'::regclass
      and c.confrelid = 'public.cronograma_actividades'::regclass
      and att.attname = 'activity_id'
  loop
    if fk.confdeltype = 'c' then
      tiene_cascade := true;
      raise notice 'La FK % ya tiene ON DELETE CASCADE.', fk.conname;
    else
      execute format('alter table public.cronograma_archivos drop constraint %I', fk.conname);
      raise notice 'FK % sin CASCADE eliminada; se recreará con CASCADE.', fk.conname;
    end if;
  end loop;

  if not tiene_cascade then
    select count(*) into huerfanas
    from public.cronograma_archivos f
    where f.activity_id is not null
      and not exists (select 1 from public.cronograma_actividades a where a.id = f.activity_id);

    if huerfanas > 0 then
      raise exception 'Hay % fila(s) huérfana(s) en cronograma_archivos. Revisa la consulta 0.5, límpialas con 0.6 y vuelve a ejecutar el script. No se aplicó ningún cambio.', huerfanas;
    end if;

    alter table public.cronograma_archivos
      add constraint cronograma_archivos_activity_id_fkey
      foreign key (activity_id)
      references public.cronograma_actividades (id)
      on delete cascade;
    raise notice 'Creada FK cronograma_archivos_activity_id_fkey con ON DELETE CASCADE.';
  end if;
end $$;

-- Índice para que el CASCADE y las búsquedas por actividad sean rápidos.
create index if not exists cronograma_archivos_activity_id_idx
  on public.cronograma_archivos (activity_id);

commit;


-- =====================================================================
-- 6. DESPUÉS DE EJECUTAR (comentado)
-- =====================================================================

-- 6.1 Ver los usuarios creados y su UUID:
-- select id, email, created_at from auth.users order by created_at;

-- 6.2 Asignar (o cambiar) el rol de un usuario por su UUID.
--     Roles válidos: 'superior', 'academico', 'administracion'.
-- insert into public.perfiles (id, rol)
-- values ('00000000-0000-0000-0000-000000000000', 'superior')
-- on conflict (id) do update set rol = excluded.rol;

-- 6.3 Ver los perfiles con su email:
-- select p.id, u.email, p.rol
-- from public.perfiles p
-- join auth.users u on u.id = p.id;

-- 6.4 Quitar el rol a un usuario (deja de poder borrar):
-- delete from public.perfiles where id = '00000000-0000-0000-0000-000000000000';

-- 6.5 Prueba en el SQL Editor sin borrar nada de verdad (rollback).
--     Cambia 123 por el id de una actividad real. Ejecuta el bloque
--     completo; debe devolver 0 filas porque anon no puede borrar.
-- begin;
--   set local role anon;
--   delete from public.cronograma_actividades where id = 123 returning id;
-- rollback;

-- 6.6 La misma prueba como un usuario con rol (debe devolver 1 fila,
--     y el rollback la deshace). Cambia el UUID y el id.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
--   select public.es_revisor();  -- debe ser true
--   delete from public.cronograma_actividades where id = 123 returning id;
-- rollback;
