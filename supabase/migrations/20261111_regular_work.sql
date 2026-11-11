begin;
create table if not exists desk_private.work_tasks(
 id uuid primary key default gen_random_uuid(), officer uuid not null references desk_private.officers(id),
 title text not null check(length(btrim(title)) between 1 and 200), starts date not null, ends date,
 check(ends is null or ends>=starts)
);
create table if not exists desk_private.work_completed(
 task uuid not null references desk_private.work_tasks(id), day date not null,
 completed_at timestamptz not null default clock_timestamp(), approved boolean not null default false,
 primary key(task,day)
);
create table if not exists desk_private.work_requests(
 id uuid primary key default gen_random_uuid(), task uuid not null references desk_private.work_tasks(id),
 requester uuid not null references desk_private.officers(id), kind text not null check(kind in ('reason','edit','delete')),
 day date, body text not null check(length(btrim(body)) between 1 and 2000),
 status text not null default 'Pending' check(status in ('Pending','Approved','Rejected')),
 created timestamptz not null default clock_timestamp(), reviewed_by uuid references desk_private.officers(id), reviewed_at timestamptz
);
create unique index if not exists work_pending_reason on desk_private.work_requests(task,day) where kind='reason' and status='Pending';
create unique index if not exists work_pending_change on desk_private.work_requests(task) where kind in ('edit','delete') and status='Pending';
create index if not exists work_reasons_history on desk_private.work_requests(task,day,created desc) where kind='reason';
create index if not exists work_tasks_officer_dates on desk_private.work_tasks(officer,starts,ends);
alter table desk_private.work_tasks enable row level security;
alter table desk_private.work_completed enable row level security;
alter table desk_private.work_requests enable row level security;
revoke all on desk_private.work_tasks,desk_private.work_completed,desk_private.work_requests from public,anon,authenticated;

create or replace function public.desk_regular_work_summary() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; today date:=(now() at time zone 'Asia/Dhaka')::date;
begin
 actor:=desk_private.member();
 return jsonb_build_object('today',today,'count',(select count(*) from desk_private.work_tasks where officer=actor.id and starts<=today and (ends is null or ends>=today)),
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
 where (actor.manager=1 or t.officer=actor.id) and t.starts<=today and (t.ends is null or t.ends>=today)),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'officer',t.officer,'name',o.name,'day',d.day,'completed',c.task is not null,'approved',coalesce(c.approved,false),'request',r.status,'reason',r.body) order by d.day desc,o.name,t.title,t.id)
 from desk_private.work_tasks t join desk_private.officers o on o.id=t.officer
 cross join lateral (select (greatest(lo,t.starts)+n)::date as day from generate_series(0,least(hi,coalesce(t.ends,hi))-greatest(lo,t.starts)) n) d
 left join desk_private.work_completed c on c.task=t.id and c.day=d.day
 left join lateral(select status,body from desk_private.work_requests where task=t.id and day=d.day and kind='reason' order by created desc,id desc limit 1) r on true
 where (actor.manager=1 or t.officer=actor.id)),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('title',t.title,'name',o.name) order by r.created desc)
 from desk_private.work_requests r join desk_private.work_tasks t on t.id=r.task join desk_private.officers o on o.id=r.requester
 where (actor.manager=1 and r.status='Pending') or (r.requester=actor.id and r.kind<>'reason' and (r.status='Pending' or r.created>=now()-interval '30 days'))),'[]'::jsonb));
end;$$;

create or replace function public.desk_regular_work_write(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; t desk_private.work_tasks; r desk_private.work_requests; today date:=(now() at time zone 'Asia/Dhaka')::date;
 action text:=p->>'action'; target uuid; work_day date; content text:=btrim(coalesce(p->>'body','')); change_kind text; replacement uuid;
begin
 actor:=desk_private.member();
 if action='add' then
  if length(content) not between 1 and 200 then raise exception 'Enter a task title (1–200 characters)';end if;
  if p->>'officer'='all' then
   if actor.manager<>1 then raise exception 'Manager access required' using errcode='42501';end if;
   insert into desk_private.work_tasks(officer,title,starts) select id,content,today from desk_private.officers where not archived;
  else
   target:=coalesce(nullif(p->>'officer','')::uuid,actor.id);
   if target<>actor.id and actor.manager<>1 then raise exception 'Manager access required' using errcode='42501';end if;
   if not exists(select 1 from desk_private.officers where id=target and not archived) then raise exception 'Select an active officer';end if;
   insert into desk_private.work_tasks(officer,title,starts) values(target,content,today);
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
  if t.officer<>actor.id or not(today>=t.starts and (t.ends is null or today<=t.ends)) or work_day is distinct from today then raise exception 'Only the assigned officer can complete today’s task';end if;
  insert into desk_private.work_completed(task,day) values(t.id,today) on conflict do nothing;
 elsif change_kind='reason' then
  if work_day is null or work_day>=today or work_day<t.starts or (t.ends is not null and work_day>t.ends) or exists(select 1 from desk_private.work_completed where task=t.id and day=work_day) then raise exception 'Choose an incomplete task from a past day';end if;
  if action='approve' then
   insert into desk_private.work_completed(task,day,approved) values(t.id,work_day,true);
  else
   if t.officer<>actor.id or length(content) not between 1 and 2000 then raise exception 'Enter a reason for your missed task';end if;
   insert into desk_private.work_requests(task,requester,kind,day,body) values(t.id,actor.id,'reason',work_day,content);
  end if;
 elsif change_kind in ('edit','delete','transfer') then
  if t.starts>today or t.ends is not null then raise exception 'This task already has a scheduled change or is no longer active';end if;
  if change_kind='edit' and length(content) not between 1 and 200 then raise exception 'Enter a task title (1–200 characters)';end if;
  if actor.manager<>1 then
   if change_kind='transfer' then raise exception 'Manager access required' using errcode='42501';end if;
   insert into desk_private.work_requests(task,requester,kind,body) values(t.id,actor.id,change_kind,case when change_kind='delete' then 'Remove this daily task' else content end);
  else
   if change_kind='transfer' then
    replacement:=(p->>'officer')::uuid;
    if replacement is null or replacement=t.officer or not exists(select 1 from desk_private.officers where id=replacement and not archived) then raise exception 'Select another active officer';end if;
   end if;
   update desk_private.work_tasks set ends=today where id=t.id;
   if change_kind<>'delete' then insert into desk_private.work_tasks(officer,title,starts) values(coalesce(replacement,t.officer),case when change_kind='edit' then content else t.title end,today+1);end if;
   update desk_private.work_requests set status='Rejected',reviewed_by=actor.id,reviewed_at=clock_timestamp() where task=t.id and kind in ('edit','delete') and status='Pending' and id is distinct from r.id;
  end if;
 else raise exception 'Unknown regular work action';
 end if;
 if action='approve' then update desk_private.work_requests set status='Approved',reviewed_by=actor.id,reviewed_at=clock_timestamp() where id=r.id;end if;
end;$$;
revoke all on function public.desk_regular_work_summary(),public.desk_regular_work_read(date,date),public.desk_regular_work_write(jsonb) from public,anon,authenticated;
grant execute on function public.desk_regular_work_summary(),public.desk_regular_work_read(date,date),public.desk_regular_work_write(jsonb) to authenticated;
create or replace function public.desk_storage_usage() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; used bigint; app_bytes bigint; quota bigint;
begin
 actor:=desk_private.member();
 if actor.manager<>1 then raise exception 'Manager access required' using errcode='42501'; end if;
 used:=pg_database_size(current_database());
 select reference_limit_bytes into quota from desk_private.storage_settings where singleton;
 app_bytes:=pg_total_relation_size('desk_private.tickets'::regclass)+pg_total_relation_size('desk_private.updates'::regclass)+pg_total_relation_size('desk_private.officers'::regclass)+pg_total_relation_size('desk_private.storage_settings'::regclass)+pg_total_relation_size('desk_private.ticket_events'::regclass)+pg_total_relation_size('desk_private.report_settings'::regclass)+pg_total_relation_size('desk_private.notifications'::regclass)+pg_total_relation_size('desk_private.manager_transfers'::regclass)+pg_total_relation_size('desk_private.work_tasks'::regclass)+pg_total_relation_size('desk_private.work_completed'::regclass)+pg_total_relation_size('desk_private.work_requests'::regclass);
 return jsonb_build_object('used_bytes',used,'reference_limit_bytes',quota,
  'remaining_estimate_bytes',greatest(0,quota-used),'app_bytes',app_bytes,
  'ticket_count',(select count(*) from desk_private.tickets),
  'update_count',(select count(*) from desk_private.updates),'checked_at',clock_timestamp());
end;$$;




commit;
