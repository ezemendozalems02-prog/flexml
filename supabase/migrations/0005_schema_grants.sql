-- Corrige permisos base del esquema public para los roles estándar de
-- Supabase. Necesario cuando el proyecto no hereda automáticamente las
-- concesiones por defecto al crear tablas vía SQL Editor (síntoma:
-- "permission denied for table X" incluso para service_role, que debería
-- saltarse RLS por completo).

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;
