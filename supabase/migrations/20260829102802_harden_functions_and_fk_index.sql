-- =====================================================================
--  Videothèque · harden SECURITY DEFINER functions, index the FK
--
--  Three things, all raised by `supabase db advisors` against the linked
--  project:
--
--  1. Adopt rls_auto_enable() + its event trigger into migration history.
--     They already exist on the hosted database but were applied by hand,
--     so `db reset` never recreated them and local drifted from hosted.
--     Defined here with create-or-replace / drop-if-exists so this runs
--     clean whether or not the objects are already present.
--
--  2. Revoke EXECUTE on the two SECURITY DEFINER functions. Postgres
--     grants EXECUTE to PUBLIC by default, so `handle_new_user` and
--     `rls_auto_enable` show up as anon-callable RPC endpoints
--     (/rest/v1/rpc/...). Neither is invocable in practice - one returns
--     `trigger`, the other `event_trigger` - but the advisor flags the
--     grant and the fix is free. The triggers keep working: they fire as
--     the function owner and do not consult EXECUTE.
--
--  3. Add a covering index for shelf_items.film_id. The composite primary
--     key (shelf_id, film_id) covers the shelf_id foreign key but leaves
--     shelf_items_film_id_fkey unindexed, so deleting a films row scans
--     shelf_items. Rare, but the index is cheap.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. rls_auto_enable · safety net that turns on RLS for any new table
--     created in public, so an exposed table is never left world-open.
--     Reproduced verbatim from the hosted definition.
-- ---------------------------------------------------------------------
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = 'pg_catalog'
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null
       and cmd.schema_name in ('public')
       and cmd.schema_name not in ('pg_catalog', 'information_schema')
       and cmd.schema_name not like 'pg_toast%'
       and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (system schema or not in enforced list: %.)',
        cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$$;

-- create event trigger has no "if not exists"; drop then recreate.
drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();


-- ---------------------------------------------------------------------
--  2. Close the default PUBLIC execute grant on both SECURITY DEFINER
--     functions.
-- ---------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;


-- ---------------------------------------------------------------------
--  3. Covering index for the shelf_items -> films foreign key.
-- ---------------------------------------------------------------------
create index if not exists shelf_items_film_id_idx
  on public.shelf_items (film_id);
