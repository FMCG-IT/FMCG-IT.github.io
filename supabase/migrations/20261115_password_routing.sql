begin;
create table if not exists desk_private.password_requests(
 officer uuid primary key references desk_private.officers(id) on delete cascade,
 requested_at timestamptz not null default clock_timestamp()
);
alter table desk_private.password_requests enable row level security;
revoke all on desk_private.password_requests from public,anon,authenticated;
create or replace function public.desk_request_password(p_email text) returns void
language sql security definer set search_path='' as $$
 insert into desk_private.password_requests(officer)
 select id from desk_private.officers where email=lower(btrim(p_email)) and manager=0 and not archived and account is not null
 on conflict do nothing;
$$;
create or replace function public.desk_password_requests() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers;
begin
 actor:=desk_private.member();
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name) order by r.requested_at desc)
 from desk_private.password_requests r join desk_private.officers o on o.id=r.officer
 where not o.archived and o.manager=0 and o.account is not null and
 ( (actor.manager=1 and o.department_role='manager') or (actor.department_role='manager' and o.department_role='member'
 and desk_private.section_for(actor.specialty)=desk_private.section_for(o.specialty)))),'[]'::jsonb);
end;$$;
create or replace function public.desk_member_reset_account(p_actor uuid,p_officer uuid) returns uuid
language sql security definer set search_path='' as $$
 select o.account from desk_private.officers o cross join desk_private.officers a
 where a.account=p_actor and not a.archived and o.id=p_officer and o.manager=0 and not o.archived and o.id<>a.id
 and (a.manager=1 or (a.department_role='manager' and o.department_role='member'
 and desk_private.section_for(a.specialty)=desk_private.section_for(o.specialty)
 and exists(select 1 from desk_private.password_requests where officer=o.id)));
$$;
create or replace function public.desk_clear_password_request(p_officer uuid) returns void
language sql security definer set search_path='' as $$
 delete from desk_private.password_requests where officer=p_officer;
$$;
revoke all on function public.desk_request_password(text),public.desk_password_requests(),public.desk_member_reset_account(uuid,uuid),public.desk_clear_password_request(uuid) from public,anon,authenticated;
grant execute on function public.desk_request_password(text) to anon,authenticated;
grant execute on function public.desk_password_requests() to authenticated;
grant execute on function public.desk_member_reset_account(uuid,uuid),public.desk_clear_password_request(uuid) to service_role;
commit;
