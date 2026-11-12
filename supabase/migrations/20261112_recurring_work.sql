begin;
alter table desk_private.work_tasks add column if not exists repeat_months integer not null default 0 check(repeat_months in (0,1,3,6,12));
alter table desk_private.work_tasks add column if not exists anchor date;
-- A future schedule can be retired before its first occurrence.
alter table desk_private.work_tasks drop constraint if exists work_tasks_check;

create or replace function desk_private.work_occurrences(t desk_private.work_tasks, lo date, hi date)
returns setof date language sql stable set search_path='' as $$
 select d::date from generate_series(greatest(lo,t.starts)::timestamp,least(hi,coalesce(t.ends,hi))::timestamp,interval '1 day') d
 where t.repeat_months=0
 union all
 select d.day
 from generate_series(0,greatest(0,(extract(year from hi)::int-extract(year from t.anchor)::int)*12+extract(month from hi)::int-extract(month from t.anchor)::int)/nullif(t.repeat_months,0)) n
 cross join lateral (select (t.anchor+make_interval(months=>n*t.repeat_months))::date as day) d
 where t.repeat_months>0 and d.day between greatest(lo,t.starts) and least(hi,coalesce(t.ends,hi));
$$;

create or replace function desk_private.work_schedule_rows(actor desk_private.officers,today date,lo date,hi date)
returns table(day date,entry jsonb) language sql stable set search_path='' as $$
 select d.day,to_jsonb(t)||jsonb_build_object('name',o.name,'day',d.day,'deadline',d.day+13,
  'completed',c.task is not null,'completed_at',c.completed_at,'approved',coalesce(c.approved,false),'request',r.status,'reason',r.body)
 from desk_private.work_tasks t join desk_private.officers o on o.id=t.officer
 cross join lateral (
  select day from desk_private.work_occurrences(t,coalesce(lo,t.starts),coalesce(hi,today)) day
  union all
  (select day from desk_private.work_occurrences(t,today+1,greatest(today+366,t.starts+366)) day
   where lo is null and t.ends is null order by day limit 1)
 ) d
 left join desk_private.work_completed c on c.task=t.id and c.day=d.day
 left join lateral(select status,body from desk_private.work_requests where task=t.id and day=d.day and kind='reason' order by created desc,id desc limit 1) r on true
 where t.repeat_months>0 and (actor.manager=1 or t.officer=actor.id)
  and (lo is not null or c.task is null or d.day+13>=today);
$$;
revoke all on function desk_private.work_occurrences(desk_private.work_tasks,date,date),desk_private.work_schedule_rows(desk_private.officers,date,date,date) from public,anon,authenticated;

create or replace function public.desk_regular_work_summary() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; today date:=(now() at time zone 'Asia/Dhaka')::date;
begin
 actor:=desk_private.member();
 return jsonb_build_object('today',today,'count',(select count(*) from desk_private.work_tasks t where officer=actor.id and (
 (repeat_months=0 and starts<=today and (ends is null or ends>=today))
 or (repeat_months>0 and exists(select 1 from desk_private.work_occurrences(t,today-13,today)))
 )),
 'approvals',case when actor.manager=1 then (select count(*) from desk_private.work_requests where status='Pending') else 0 end);
end;$$;

create or replace function public.desk_regular_work_read(p_from date default null,p_to date default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; today date:=(now() at time zone 'Asia/Dhaka')::date; lo date; hi date;
begin
 actor:=desk_private.member();lo:=coalesce(p_from,today-7);hi:=least(coalesce(p_to,today-1),today-1);
 if hi<lo or hi-lo>30 then raise exception 'Choose a past date range of at most 31 days';end if;
 return jsonb_build_object('today',today,
 'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('name',o.name,'completed',c.task is not null,'approved',coalesce(c.approved,false)) order by o.name,t.title,t.id)
 from desk_private.work_tasks t join desk_private.officers o on o.id=t.officer left join desk_private.work_completed c on c.task=t.id and c.day=today
 where (actor.manager=1 or t.officer=actor.id) and t.repeat_months=0 and t.starts<=today and (t.ends is null or t.ends>=today)),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'officer',t.officer,'name',o.name,'day',d.day,'completed',c.task is not null,'approved',coalesce(c.approved,false),'request',r.status,'reason',r.body) order by d.day desc,o.name,t.title,t.id)
 from desk_private.work_tasks t join desk_private.officers o on o.id=t.officer
 cross join lateral (select (greatest(lo,t.starts)+n)::date as day from generate_series(0,least(hi,coalesce(t.ends,hi))-greatest(lo,t.starts)) n) d
 left join desk_private.work_completed c on c.task=t.id and c.day=d.day
 left join lateral(select status,body from desk_private.work_requests where task=t.id and day=d.day and kind='reason' order by created desc,id desc limit 1) r on true
 where t.repeat_months=0 and (actor.manager=1 or t.officer=actor.id)),'[]'::jsonb),
 'scheduled',coalesce((select jsonb_agg(x.entry order by x.day) from desk_private.work_schedule_rows(actor,today,null,null) x),'[]'::jsonb),
 'scheduledHistory',coalesce((select jsonb_agg(x.entry order by x.day desc) from desk_private.work_schedule_rows(actor,today,lo,least(coalesce(p_to,today),today)) x),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('title',t.title,'name',o.name) order by r.created desc)
 from desk_private.work_requests r join desk_private.work_tasks t on t.id=r.task join desk_private.officers o on o.id=r.requester
 where (actor.manager=1 and r.status='Pending') or (r.requester=actor.id and r.kind<>'reason' and (r.status='Pending' or r.created>=now()-interval '30 days'))),'[]'::jsonb));
end;$$;

create or replace function public.desk_regular_work_write(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; t desk_private.work_tasks; r desk_private.work_requests; today date:=(now() at time zone 'Asia/Dhaka')::date;
 action text:=p->>'action'; target uuid; work_day date; content text:=btrim(coalesce(p->>'body','')); change_kind text; replacement uuid; repeat_months integer; first_day date;
begin
 actor:=desk_private.member();
 if action='add' then
  repeat_months:=coalesce(nullif(p->>'repeat_months','')::integer,0);
  if repeat_months not in (0,1,3,6,12) then raise exception 'Choose a supported repeat interval';end if;
  first_day:=case when repeat_months=0 then today else nullif(p->>'first_due','')::date end;
  if first_day is null or first_day<today then raise exception 'Choose today or a future start date';end if;
  if length(content) not between 1 and 200 then raise exception 'Enter a task title (1–200 characters)';end if;
  if p->>'officer'='all' then
   if actor.manager<>1 then raise exception 'Manager access required' using errcode='42501';end if;
   insert into desk_private.work_tasks(officer,title,starts,repeat_months,anchor) select id,content,first_day,repeat_months,first_day from desk_private.officers where not archived;
  else
   target:=coalesce(nullif(p->>'officer','')::uuid,actor.id);
   if target<>actor.id and actor.manager<>1 then raise exception 'Manager access required' using errcode='42501';end if;
   if not exists(select 1 from desk_private.officers where id=target and not archived) then raise exception 'Select an active officer';end if;
   insert into desk_private.work_tasks(officer,title,starts,repeat_months,anchor) values(target,content,first_day,repeat_months,first_day);
  end if;
  return;
 end if;
 if action in ('approve','reject') then
  if actor.manager<>1 then raise exception 'Manager access required' using errcode='42501';end if;
  select * into r from desk_private.work_requests where id=(p->>'request')::uuid;
  select * into t from desk_private.work_tasks where id=r.task for update;
  select * into r from desk_private.work_requests where id=r.id for update;
  if r.id is null or r.status<>'Pending' then raise exception 'Request has already been reviewed or was not found';end if;
  if action='reject' then update desk_private.work_requests set status='Rejected',reviewed_by=actor.id,reviewed_at=clock_timestamp() where id=r.id;return;end if;
  change_kind:=r.kind;content:=r.body;work_day:=r.day;
 else
  select * into t from desk_private.work_tasks where id=(p->>'task')::uuid for update;
  change_kind:=action;work_day:=nullif(p->>'day','')::date;
 end if;
 if t.id is null or (t.officer<>actor.id and actor.manager<>1) then raise exception 'Task not available' using errcode='42501';end if;
 if action='complete' then
  if t.officer<>actor.id or work_day is null or not exists(select 1 from desk_private.work_occurrences(t,work_day,work_day))
   or today<work_day or today>work_day+(case when t.repeat_months=0 then 0 else 13 end) then
   raise exception 'Only the assigned officer can complete work during its scheduled period';
  end if;
  insert into desk_private.work_completed(task,day) values(t.id,work_day) on conflict do nothing;
 elsif change_kind='reason' then
  if work_day is null or today<=work_day+(case when t.repeat_months=0 then 0 else 13 end)
   or not exists(select 1 from desk_private.work_occurrences(t,work_day,work_day))
   or exists(select 1 from desk_private.work_completed where task=t.id and day=work_day) then raise exception 'Choose an incomplete task past its deadline';end if;
  if action='approve' then
   insert into desk_private.work_completed(task,day,approved) values(t.id,work_day,true);
  else
   if t.officer<>actor.id or length(content) not between 1 and 2000 then raise exception 'Enter a reason for your missed task';end if;
   insert into desk_private.work_requests(task,requester,kind,day,body) values(t.id,actor.id,'reason',work_day,content);
  end if;
 elsif change_kind in ('edit','delete','transfer') then
  if (t.repeat_months=0 and t.starts>today) or t.ends is not null then raise exception 'This task already has a scheduled change or is no longer active';end if;
  if change_kind='edit' and length(content) not between 1 and 200 then raise exception 'Enter a task title (1–200 characters)';end if;
  if actor.manager<>1 then
   if change_kind='transfer' then raise exception 'Manager access required' using errcode='42501';end if;
   insert into desk_private.work_requests(task,requester,kind,body) values(t.id,actor.id,change_kind,case when change_kind='delete' then 'Remove this recurring task' else content end);
  else
   if change_kind='transfer' then
    replacement:=(p->>'officer')::uuid;
    if replacement is null or replacement=t.officer or not exists(select 1 from desk_private.officers where id=replacement and not archived) then raise exception 'Select another active officer';end if;
   end if;
   update desk_private.work_tasks set ends=today where id=t.id;
   if change_kind<>'delete' then insert into desk_private.work_tasks(officer,title,starts,repeat_months,anchor) values(coalesce(replacement,t.officer),case when change_kind='edit' then content else t.title end,greatest(t.starts,today+1),t.repeat_months,t.anchor);end if;
   update desk_private.work_requests set status='Rejected',reviewed_by=actor.id,reviewed_at=clock_timestamp() where task=t.id and kind in ('edit','delete') and status='Pending' and id is distinct from r.id;
  end if;
 else raise exception 'Unknown regular work action';
 end if;
 if action='approve' then update desk_private.work_requests set status='Approved',reviewed_by=actor.id,reviewed_at=clock_timestamp() where id=r.id;end if;
end;$$;
revoke all on function public.desk_regular_work_summary(),public.desk_regular_work_read(date,date),public.desk_regular_work_write(jsonb) from public,anon,authenticated;
grant execute on function public.desk_regular_work_summary(),public.desk_regular_work_read(date,date),public.desk_regular_work_write(jsonb) to authenticated;
commit;
