begin;
create or replace function public.desk_save_project(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; existing desk_private.projects;
 project_id bigint:=nullif(p->>'id','')::bigint;
 target uuid:=(p->>'assignee')::uuid;
 phase text:=coalesce(p->>'status','New project');
 selected_office text:=nullif(p->>'office','');
 selected_team text:=p->>'team';
 selected_priority text:=coalesce(p->>'priority','Medium');
 details text:=coalesce(btrim(p->>'description'),'');
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
 if (project_id is null or existing.office is not null or selected_office is not null)
  and (selected_office is null or not desk_private.valid_offices(array[selected_office])) then
  raise exception 'Select a valid office / area';
 end if;
 if selected_team is null or not exists(select 1 from desk_private.officers where id=target and desk_private.section_for(specialty)=selected_team)
  then raise exception 'Select an assignee from the selected team';end if;
 if project_id is null then
  insert into desk_private.projects(subject,created_by,assignee,deadline,latest_update,office,team,priority,description)
  values(btrim(p->>'subject'),actor.id,target,(p->>'deadline')::date,'',selected_office,selected_team,selected_priority,details);
 else
  update desk_private.projects set subject=btrim(p->>'subject'),assignee=target,deadline=(p->>'deadline')::date,
   status=phase,office=selected_office,team=selected_team,priority=selected_priority,latest_update=coalesce(btrim(p->>'latest_update'),'') where id=project_id;
 end if;
end;$$;
create table if not exists desk_private.delete_requests(
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('ticket','project')),
 target text not null,
 subject text not null,
 requester uuid not null references desk_private.officers(id),
 unique(kind,target,requester)
);
alter table desk_private.delete_requests enable row level security;
revoke all on desk_private.delete_requests from public,anon,authenticated;
create or replace function public.desk_delete_requests() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers;
begin
 actor:=desk_private.member();
 if actor.manager<>1 then return '[]'::jsonb;end if;
 return coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('name',o.name) order by r.subject,r.id)
 from desk_private.delete_requests r join desk_private.officers o on o.id=r.requester),'[]'::jsonb);
end;$$;
create or replace function public.desk_delete_action(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; req desk_private.delete_requests;
 action text:=p->>'action'; item_kind text:=p->>'kind'; item_id text:=p->>'target';
 item_subject text; creator uuid; assigned uuid;
begin
 actor:=desk_private.member();
 if action in ('approve','reject') then
  if actor.manager<>1 then raise exception 'Manager access required';end if;
  select * into req from desk_private.delete_requests where id=(p->>'id')::uuid;
  if req.id is null then raise exception 'Request already resolved';end if;
  item_kind:=req.kind;item_id:=req.target;
 elsif action is distinct from 'delete' then raise exception 'Invalid action';
 end if;
 if item_kind='ticket' then
  select title,created_by,assignee into item_subject,creator,assigned from desk_private.tickets where id=item_id for update;
 elsif item_kind='project' then
  select subject,created_by,assignee into item_subject,creator,assigned from desk_private.projects where id=item_id::bigint for update;
 else raise exception 'Invalid item type';
 end if;
 if item_subject is null then raise exception 'Item no longer exists';end if;
 if req.id is not null and not exists(select 1 from desk_private.delete_requests where id=req.id) then raise exception 'Request already resolved';end if;
 if action='reject' then
  delete from desk_private.delete_requests where id=req.id;
 elsif actor.manager=1 then
  if item_kind='ticket' then
   delete from desk_private.updates where ticket=item_id;
   delete from desk_private.tickets where id=item_id;
  else
   delete from desk_private.projects where id=item_id::bigint;
  end if;
  delete from desk_private.delete_requests where kind=item_kind and target=item_id;
 else
  if actor.id is distinct from creator and actor.id is distinct from assigned then raise exception 'Only the creator or assignee can request deletion';end if;
  insert into desk_private.delete_requests(kind,target,subject,requester) values(item_kind,item_id,item_subject,actor.id) on conflict do nothing;
 end if;
end;$$;
revoke all on function public.desk_delete_requests(),public.desk_delete_action(jsonb) from public,anon,authenticated;
grant execute on function public.desk_delete_requests(),public.desk_delete_action(jsonb) to authenticated;
commit;
