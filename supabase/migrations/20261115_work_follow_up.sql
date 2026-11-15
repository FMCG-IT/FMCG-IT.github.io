begin;
create table if not exists desk_private.work_follow_up(
 recipient uuid not null references desk_private.officers(id),
 day date not null,
 sender text not null,
 read_at timestamptz,
 primary key(recipient,day)
);
alter table desk_private.work_follow_up enable row level security;
revoke all on desk_private.work_follow_up from public,anon,authenticated;

create or replace function public.desk_work_follow_up(p_send boolean default false,p_read date default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; today date:=(now() at time zone 'Asia/Dhaka')::date;
 can_send boolean; urgent boolean:=false; sent integer:=0;
begin
 actor:=desk_private.member();
 can_send:=actor.manager=1 or actor.department_role='manager';
 if p_send and not can_send then raise exception 'Manager access required' using errcode='42501';end if;
 if p_read is not null then
  update desk_private.work_follow_up set read_at=now() where recipient=actor.id and day=p_read and read_at is null;
 end if;
 if can_send then
  with work as materialized (
   select distinct t.officer,d.day+case when t.repeat_months=0 then 0 else 13 end < today as overdue
   from desk_private.work_tasks t join desk_private.officers o on o.id=t.officer
   cross join lateral desk_private.work_occurrences(t,t.starts,today) d(day)
   where not o.archived and (actor.manager=1 or desk_private.section_for(o.specialty)=desk_private.section_for(actor.specialty))
   and d.day+case when t.repeat_months=0 then 0 else 13 end <= today+3
   and not exists(select 1 from desk_private.work_completed c where c.task=t.id and c.day=d.day)
  ), pushed as (
   insert into desk_private.work_follow_up(recipient,day,sender)
   select officer,today,actor.name from work where p_send and overdue
   on conflict do nothing returning recipient
  )
  select exists(select 1 from work),(select count(*) from pushed) into urgent,sent;
 end if;
 return jsonb_build_object('canSend',can_send,'urgent',urgent,'sent',sent,'items',coalesce((
  select jsonb_agg(jsonb_build_object('day',day,'sender',sender) order by day desc)
  from desk_private.work_follow_up where recipient=actor.id and read_at is null
 ),'[]'::jsonb));
end;$$;
revoke all on function public.desk_work_follow_up(boolean,date) from public,anon,authenticated;
grant execute on function public.desk_work_follow_up(boolean,date) to authenticated;
commit;
