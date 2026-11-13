begin;
create table if not exists desk_private.projects (
 id bigint generated always as identity primary key,
 subject text not null check(length(btrim(subject)) between 1 and 200),
 created_by uuid not null references desk_private.officers(id),
 created_at timestamptz not null default now(),
 assignee uuid not null references desk_private.officers(id),
 deadline date not null,
 status text not null default 'New project' check(status in ('New project','Ongoing project','Completed')),
 latest_update text not null default '' check(length(latest_update)<=2000)
);
alter table desk_private.projects enable row level security;
revoke all on desk_private.projects from public,anon,authenticated;

create or replace function public.desk_projects(p_count_only boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform desk_private.member();
 if p_count_only then
  return to_jsonb((select count(*) from desk_private.projects where status='Ongoing project'));
 end if;
 return coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('creator_name',c.name,'assignee_name',a.name) order by p.id desc)
  from desk_private.projects p join desk_private.officers c on c.id=p.created_by join desk_private.officers a on a.id=p.assignee),'[]'::jsonb);
end;$$;

create or replace function public.desk_save_project(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; existing desk_private.projects;
 project_id bigint:=nullif(p->>'id','')::bigint;
 target uuid:=(p->>'assignee')::uuid;
 phase text:=coalesce(p->>'status','New project');
begin
 actor:=desk_private.member();
 if project_id is not null then
  select * into existing from desk_private.projects where id=project_id for update;
  if existing.id is null or (actor.manager<>1 and actor.id not in (existing.created_by,existing.assignee)) then
   raise exception 'Project unavailable' using errcode='42501';
  end if;
 end if;
 if target is null or not exists(select 1 from desk_private.officers where id=target and (not archived or id=existing.assignee)) then
  raise exception 'Select an active assignee';
 end if;
 if project_id is null then
  insert into desk_private.projects(subject,created_by,assignee,deadline,latest_update)
  values(btrim(p->>'subject'),actor.id,target,(p->>'deadline')::date,coalesce(btrim(p->>'latest_update'),''));
 else
  update desk_private.projects set subject=btrim(p->>'subject'),assignee=target,deadline=(p->>'deadline')::date,
   status=phase,latest_update=coalesce(btrim(p->>'latest_update'),'') where id=project_id;
 end if;
end;$$;
revoke all on function public.desk_projects(boolean),public.desk_save_project(jsonb) from public,anon,authenticated;
grant execute on function public.desk_projects(boolean),public.desk_save_project(jsonb) to authenticated;
commit;
