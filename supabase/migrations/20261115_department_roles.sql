begin;
alter table desk_private.officers add column if not exists department_role text not null default 'member'
 check(department_role in ('member','manager'));

create or replace function public.desk_register_officer_with_role(p_actor uuid,p_account uuid,p_name text,p_section text,p_designation text,p_offices text[],p_role text) returns uuid
language plpgsql security definer set search_path='' as $$
declare officer_id uuid;
begin
 if p_role is null or p_role not in ('member','manager') then raise exception 'Select a department role';end if;
 officer_id:=public.desk_register_officer_with_offices(p_actor,p_account,p_name,p_section,p_designation,p_offices);
 update desk_private.officers set department_role=p_role where id=officer_id and manager=0;
 return officer_id;
end;$$;
revoke all on function public.desk_register_officer_with_role(uuid,uuid,text,text,text,text[],text) from public,anon,authenticated;
grant execute on function public.desk_register_officer_with_role(uuid,uuid,text,text,text,text[],text) to service_role;

do $$ begin
 if to_regprocedure('desk_private.desk_write_before_department_roles(jsonb)') is null then
  alter function public.desk_write(jsonb) rename to desk_write_before_department_roles;
  alter function public.desk_write_before_department_roles(jsonb) set schema desk_private;
 end if;
end;$$;
revoke all on function desk_private.desk_write_before_department_roles(jsonb) from public,anon,authenticated;
create or replace function public.desk_write(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; chosen text:=p->>'department_role';
begin
 if p->>'action'='officer_edit' and p ? 'department_role' then
  actor:=desk_private.member();
  if actor.manager<>1 then raise exception 'Overall IT Manager access required' using errcode='42501';end if;
  if chosen is null or chosen not in ('member','manager') then raise exception 'Select a department role';end if;
  perform desk_private.desk_write_before_department_roles(p);
  update desk_private.officers set department_role=chosen where id::text=p->>'id' and manager=0 and not archived;
 else
  perform desk_private.desk_write_before_department_roles(p);
 end if;
end;$$;
revoke all on function public.desk_write(jsonb) from public,anon,authenticated;
grant execute on function public.desk_write(jsonb) to authenticated;
commit;
