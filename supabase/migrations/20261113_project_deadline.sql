begin;
create or replace function desk_private.validate_project_deadline() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.deadline is not distinct from old.deadline then return new;end if;
 end if;
 if new.deadline < (statement_timestamp() at time zone 'Asia/Dhaka')::date then
  raise exception 'Project deadline must be today or later (BDT)';
 end if;
 return new;
end;$$;
drop trigger if exists desk_project_deadline on desk_private.projects;
create trigger desk_project_deadline before insert or update of deadline on desk_private.projects
 for each row execute function desk_private.validate_project_deadline();
commit;
