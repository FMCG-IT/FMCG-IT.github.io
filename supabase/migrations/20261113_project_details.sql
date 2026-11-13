begin;
alter table desk_private.projects
 add column if not exists office text,
 add column if not exists team text check(team in ('Infrastructure','Software/System','SAP')),
 add column if not exists priority text not null default 'Medium' check(priority in ('Low','Medium','High','Critical')),
 add column if not exists description text not null default '' check(length(description)<=10000);
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
  values(btrim(p->>'subject'),actor.id,target,(p->>'deadline')::date,coalesce(btrim(p->>'latest_update'),''),selected_office,selected_team,selected_priority,details);
 else
  update desk_private.projects set subject=btrim(p->>'subject'),assignee=target,deadline=(p->>'deadline')::date,
   status=phase,office=selected_office,team=selected_team,priority=selected_priority,description=details,latest_update=coalesce(btrim(p->>'latest_update'),'') where id=project_id;
 end if;
end;$$;
commit;
