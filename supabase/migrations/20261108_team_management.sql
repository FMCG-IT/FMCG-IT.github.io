begin;
alter table desk_private.officers add column if not exists archived boolean not null default false;
create or replace function desk_private.member() returns desk_private.officers
language plpgsql security definer set search_path = '' as $$
declare officer desk_private.officers;
begin
 select o.* into officer from desk_private.officers o where o.account=auth.uid() and not o.archived;
 if officer.id is null and auth.uid() is not null then
  update desk_private.officers o set account=auth.uid()
   from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
   and o.account is null and o.manager=0 and not o.archived and o.email=lower(u.email)
   returning o.* into officer;
 end if;
 if officer.id is null then raise exception 'Your account is not in the IT team.' using errcode='42501'; end if;
 return officer;
end;$$;
revoke all on function desk_private.member() from public,anon,authenticated;
do $$ begin
 if to_regprocedure('desk_private.desk_write_v1(jsonb)') is null then
  alter function public.desk_write(jsonb) rename to desk_write_v1;
  alter function public.desk_write_v1(jsonb) set schema desk_private;
 end if;
end;$$;
revoke all on function desk_private.desk_write_v1(jsonb) from public,anon,authenticated;

create or replace function public.desk_write(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare actor desk_private.officers; target desk_private.officers; replacement desk_private.officers;
 action text:=p->>'action'; next_email text:=lower(btrim(coalesce(p->>'email','')));
 display_name text:=btrim(coalesce(p->>'name','')); section text:=p->>'specialty';
begin
 actor:=desk_private.member();
 if action in ('officer_edit','officer_delete') then
  if actor.manager<>1 then raise exception 'Manager access required' using errcode='42501'; end if;
  select o.* into target from desk_private.officers o where o.id::text=p->>'id' and not o.archived for update;
  if target.id is null then raise exception 'Officer not found'; end if;
  if action='officer_edit' then
   if display_name='' or length(display_name)>150 or length(next_email)>250 or next_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Enter a name and valid email'; end if;
   if section is null or section not in ('Infrastructure','Software/System','SAP') then raise exception 'Select an IT section'; end if;
   if target.manager=1 and target.email<>next_email then raise exception 'Manager login email cannot be changed here'; end if;
   update desk_private.officers set name=display_name,email=next_email,specialty=section,account=case when next_email=target.email then target.account else null end where id=target.id;
  else
   if target.manager=1 or target.id=actor.id then raise exception 'Manager accounts cannot be deleted'; end if;
   select o.* into replacement from desk_private.officers o where o.id::text=p->>'replacement' and not o.archived and o.id<>target.id;
   if replacement.id is null then raise exception 'Select another officer for the tickets'; end if;
   insert into desk_private.updates(ticket,body,internal,author)
    select t.id,'Status: '||t.status||'. Assigned to '||replacement.name||'.',0,actor.name from desk_private.tickets t where t.assignee=target.id;
   update desk_private.tickets set assignee=replacement.id where assignee=target.id;
   update desk_private.officers set archived=true where id=target.id;
  end if;
 else
  if action in ('create','update') and not exists(select 1 from desk_private.officers o where o.id::text=p->>'assignee' and not o.archived) then raise exception 'Select an active officer'; end if;
  if action='officer' and (section is null or section not in ('Infrastructure','Software/System','SAP')) then raise exception 'Select an IT section'; end if;
  perform desk_private.desk_write_v1(p);
 end if;
end;$$;
revoke all on function public.desk_write(jsonb) from public,anon,authenticated;
grant execute on function public.desk_write(jsonb) to authenticated;
commit;
