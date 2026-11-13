begin;
alter table desk_private.projects add column if not exists approval_status text not null default 'Approved'
 check(approval_status in ('Pending','Approved','Rejected'));
create or replace function public.desk_projects(p_count_only boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform desk_private.member();
 if p_count_only then
  return to_jsonb((select count(*) from desk_private.projects where approval_status='Approved' and status in ('New project','Ongoing project')));
 end if;
 return coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('creator_name',c.name,'assignee_name',a.name) order by p.id desc)
  from desk_private.projects p join desk_private.officers c on c.id=p.created_by join desk_private.officers a on a.id=p.assignee where p.approval_status='Approved'),'[]'::jsonb);
end;$$;

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
  if existing.id is null or existing.approval_status<>'Approved' or (actor.manager<>1 and actor.id not in (existing.created_by,existing.assignee)) then
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
  insert into desk_private.projects(subject,created_by,assignee,deadline,latest_update,office,team,priority,description,approval_status)
  values(btrim(p->>'subject'),actor.id,target,(p->>'deadline')::date,'',selected_office,selected_team,selected_priority,details,'Pending');
 else
  update desk_private.projects set subject=btrim(p->>'subject'),assignee=target,deadline=(p->>'deadline')::date,
   status=phase,office=selected_office,team=selected_team,priority=selected_priority,latest_update=coalesce(nullif(btrim(p->>'latest_update'),''),existing.latest_update) where id=project_id;
 end if;
end;$$;
create or replace function public.desk_project_approvals(p_id bigint default null,p_approve boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers;
begin
 actor:=desk_private.member();
 if actor.manager<>1 then
  if p_id is not null then raise exception 'Manager access required' using errcode='42501';end if;
  return '[]'::jsonb;
 end if;
 if p_id is not null then
  if p_approve is null then raise exception 'Choose approve or reject';end if;
  update desk_private.projects set approval_status=case when p_approve then 'Approved' else 'Rejected' end
   where id=p_id and approval_status='Pending';
  if not found then raise exception 'Project request already resolved';end if;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'subject',p.subject,'creator',c.name,
  'assignee',a.name,'deadline',p.deadline,'description',p.description,'team',p.team,'office',p.office,'priority',p.priority) order by p.id)
  from desk_private.projects p join desk_private.officers c on c.id=p.created_by
  join desk_private.officers a on a.id=p.assignee where p.approval_status='Pending'),'[]'::jsonb);
end;$$;
revoke all on function public.desk_project_approvals(bigint,boolean) from public,anon,authenticated;
grant execute on function public.desk_project_approvals(bigint,boolean) to authenticated;
commit;
