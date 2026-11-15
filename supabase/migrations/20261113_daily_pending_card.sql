begin;
create or replace function public.desk_regular_work_summary() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; today date:=(now() at time zone 'Asia/Dhaka')::date;
begin
 actor:=desk_private.member();
 return jsonb_build_object('today',today,'count',(select count(*) from desk_private.work_tasks t where officer=actor.id and (
 (repeat_months=0 and starts<=today and (ends is null or ends>=today))
 or (repeat_months>0 and exists(select 1 from desk_private.work_occurrences(t,today-13,today)))
 )),
 'pending_daily',(select count(*) from desk_private.work_tasks t where t.officer=actor.id
  and t.repeat_months=0 and t.starts<=today and (t.ends is null or t.ends>=today)
  and not exists(select 1 from desk_private.work_completed c where c.task=t.id and c.day=today)),
 'approvals',case when actor.manager=1 then (select count(*) from desk_private.work_requests where status='Pending') else 0 end);
end;$$;

commit;
