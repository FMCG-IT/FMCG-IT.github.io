begin;
create table if not exists desk_private.project_reminder_reads(
 recipient uuid not null references desk_private.officers(id),
 project bigint not null references desk_private.projects(id) on delete cascade,
 kind text not null,
 scheduled date not null,
 primary key(recipient,project,kind,scheduled)
);
alter table desk_private.project_reminder_reads enable row level security;
revoke all on desk_private.project_reminder_reads from public,anon,authenticated;

create or replace function public.desk_project_reminders(p_project bigint default null,p_kind text default null,p_day date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers;
 today date:=(statement_timestamp() at time zone 'Asia/Dhaka')::date;
 result jsonb;
begin
 actor:=desk_private.member();
 with eligible as (
  select p.id,p.subject,p.deadline,v.kind,v.scheduled
  from desk_private.projects p
  cross join lateral (select (p.created_at at time zone 'Asia/Dhaka')::date as first_day) origin
  cross join lateral (values
   ('progress',origin.first_day+((today-origin.first_day)/5)*5,p.assignee=actor.id and today-origin.first_day>=5),
   ('due_member',p.deadline-2,p.assignee=actor.id),
   ('due_manager',p.deadline-5,actor.manager=1)
  ) v(kind,scheduled,applies)
  where p.approval_status='Approved' and p.status<>'Completed'
   and today<=p.deadline and v.applies and v.scheduled<=today
 ), marked as (
  insert into desk_private.project_reminder_reads(recipient,project,kind,scheduled)
  select actor.id,id,kind,scheduled from eligible where id=p_project and kind=p_kind and scheduled=p_day
  on conflict do nothing returning project,kind,scheduled
 )
 select coalesce(jsonb_agg(jsonb_build_object('project',e.id,'kind',e.kind,'day',e.scheduled,
  'message',case e.kind when 'progress' then 'Project check-in: ' else 'Deadline reminder: ' end||e.subject,
  'deadline',e.deadline) order by e.scheduled desc,e.id desc),'[]'::jsonb) into result
 from eligible e
 where not exists(select 1 from desk_private.project_reminder_reads r
  where r.recipient=actor.id and r.project=e.id and r.kind=e.kind and r.scheduled=e.scheduled)
 and not exists(select 1 from marked m where m.project=e.id and m.kind=e.kind and m.scheduled=e.scheduled);
 return result;
end;$$;
revoke all on function public.desk_project_reminders(bigint,text,date) from public,anon,authenticated;
grant execute on function public.desk_project_reminders(bigint,text,date) to authenticated;
commit;
