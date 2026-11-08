begin;
alter table desk_private.tickets add column if not exists created_by uuid references desk_private.officers(id) on delete set null;
alter table desk_private.tickets add column if not exists first_response_at timestamptz;
alter table desk_private.tickets add column if not exists first_response_by uuid references desk_private.officers(id) on delete set null;
alter table desk_private.tickets add column if not exists closed_at timestamptz;
alter table desk_private.tickets add column if not exists closed_by uuid references desk_private.officers(id) on delete set null;
alter table desk_private.tickets add column if not exists metrics_complete boolean not null default false;

create table if not exists desk_private.report_settings(singleton boolean primary key default true check(singleton),tracking_started_at timestamptz not null default clock_timestamp());
insert into desk_private.report_settings(singleton) values(true) on conflict do nothing;
create table if not exists desk_private.ticket_events(
 id bigint generated always as identity primary key,
 ticket text not null references desk_private.tickets(id) on delete cascade,
 actor uuid references desk_private.officers(id) on delete set null,
 occurred_at timestamptz not null default clock_timestamp(),
 kind text not null check(kind in ('created','work')),
 from_status text,to_status text
);
create index if not exists desk_event_ticket_actor on desk_private.ticket_events(ticket,actor);
alter table desk_private.report_settings enable row level security;
alter table desk_private.ticket_events enable row level security;
revoke all on desk_private.report_settings,desk_private.ticket_events from public,anon,authenticated;

create or replace function desk_private.ticket_report_before_insert() returns trigger
language plpgsql security definer set search_path='' as $$
declare creator uuid;
begin
 select id into creator from desk_private.officers where account=auth.uid() and not archived;
 new.created_by:=creator;
 new.metrics_complete:=creator is not null;
 return new;
end;$$;
create or replace function desk_private.ticket_report_after_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.created_by is not null then
  insert into desk_private.ticket_events(ticket,actor,occurred_at,kind,to_status) values(new.id,new.created_by,new.created,'created',new.status);
 end if;
 return new;
end;$$;
revoke all on function desk_private.ticket_report_before_insert(),desk_private.ticket_report_after_insert() from public,anon,authenticated;
drop trigger if exists desk_ticket_report_before_insert on desk_private.tickets;
create trigger desk_ticket_report_before_insert before insert on desk_private.tickets for each row execute function desk_private.ticket_report_before_insert();
drop trigger if exists desk_ticket_report_after_insert on desk_private.tickets;
create trigger desk_ticket_report_after_insert after insert on desk_private.tickets for each row execute function desk_private.ticket_report_after_insert();

do $$ begin
 if to_regprocedure('desk_private.desk_write_before_reports(jsonb)') is null then
  alter function public.desk_write(jsonb) rename to desk_write_before_reports;
  alter function public.desk_write_before_reports(jsonb) set schema desk_private;
 end if;
end;$$;
revoke all on function desk_private.desk_write_before_reports(jsonb) from public,anon,authenticated;

create or replace function public.desk_write(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; previous desk_private.tickets; latest desk_private.tickets; action_time timestamptz;
begin
 actor:=desk_private.member();
 if p->>'action'='update' then
  select * into previous from desk_private.tickets where id=p->>'id' for update;
 end if;
 perform desk_private.desk_write_before_reports(p);
 if p->>'action'='update' and previous.id is not null then
  select * into latest from desk_private.tickets where id=previous.id;
  if previous.status<>latest.status or btrim(coalesce(p->>'body',''))<>'' then
   action_time:=clock_timestamp();
   insert into desk_private.ticket_events(ticket,actor,occurred_at,kind,from_status,to_status)
    values(latest.id,actor.id,action_time,'work',previous.status,latest.status);
   if (latest.metrics_complete and latest.first_response_at is null)
     or (previous.status<>latest.status and (latest.status='Closed' or previous.status='Closed')) then
    update desk_private.tickets set
     first_response_at=case when metrics_complete and first_response_at is null then action_time else first_response_at end,
     first_response_by=case when metrics_complete and first_response_at is null then actor.id else first_response_by end,
     closed_at=case when previous.status<>latest.status and latest.status='Closed' then action_time when previous.status='Closed' and latest.status<>'Closed' then null else closed_at end,
     closed_by=case when previous.status<>latest.status and latest.status='Closed' then actor.id when previous.status='Closed' and latest.status<>'Closed' then null else closed_by end
    where id=latest.id;
   end if;
  end if;
 end if;
end;$$;
revoke all on function public.desk_write(jsonb) from public,anon,authenticated;
grant execute on function public.desk_write(jsonb) to authenticated;

create or replace function public.desk_report(p_from date default null,p_to date default null,p_export boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; result jsonb;
begin
 actor:=desk_private.member();
 if actor.manager<>1 then raise exception 'Manager access required' using errcode='42501'; end if;
 if p_from is not null and p_to is not null and p_from>p_to then raise exception 'From date must be before or equal to to date'; end if;
 with cohort as materialized (
  select t.*,
   case when t.metrics_complete and t.first_response_at>=t.created then extract(epoch from (t.first_response_at-t.created))/3600.0 end response_hours,
   case when t.status='Closed' and t.closed_at>=t.created then extract(epoch from (t.closed_at-t.created))/3600.0 end closing_hours
  from desk_private.tickets t
  where (p_from is null or t.created>=(p_from::timestamp at time zone 'Asia/Dhaka'))
   and (p_to is null or t.created<((p_to+1)::timestamp at time zone 'Asia/Dhaka'))
 ), totals as (
  select count(*) total,count(*) filter(where status='New ticket') new_count,
   count(*) filter(where status='In progress') progress_count,count(*) filter(where status='Closed') closed_count,
   avg(response_hours) average_response_hours,count(response_hours) response_samples,
   avg(closing_hours) average_closing_hours,count(closing_hours) closing_samples,
   count(*) filter(where created_by is null) unknown_creators,
   count(*) filter(where not metrics_complete) legacy_tickets
  from cohort
 ), work as (
  select distinct e.ticket,e.actor from desk_private.ticket_events e join cohort t on t.id=e.ticket where e.kind='work' and e.actor is not null
 ), officer_totals as (
  select o.id,o.name,o.email,o.designation,desk_private.section_for(o.specialty) section,o.archived,
   (select count(*) from cohort t where t.created_by=o.id) created_count,
   (select count(*) from work w where w.actor=o.id) worked_count,
   (select count(*) from cohort t where t.assignee=o.id) assigned_count,
   (select count(*) from cohort t where t.status='Closed' and t.closed_by=o.id) closed_count,
   (select avg(t.response_hours) from cohort t where t.first_response_by=o.id) average_response_hours,
   (select count(t.response_hours) from cohort t where t.first_response_by=o.id) response_samples,
   (select avg(t.closing_hours) from cohort t where t.closed_by=o.id) average_closing_hours,
   (select count(t.closing_hours) from cohort t where t.closed_by=o.id) closing_samples
  from desk_private.officers o
 ), officers as (
  select o.*,case when t.total>0 then o.worked_count::numeric/t.total*100 end work_share_percent from officer_totals o cross join totals t
   where not o.archived or o.created_count>0 or o.worked_count>0 or o.assigned_count>0 or o.closed_count>0
 ), export_rows as (
  select t.id,t.ticket_number,t.title,t.created,
   creator.name creator_name,t.created_by,
   desk_private.section_for(assigned.specialty) section,assigned.name assignee_name,t.assignee,
   t.employee,t.department,t.category,t.priority,t.status,t.first_response_at,
   responder.name first_response_name,t.response_hours,t.closed_at,closer.name closed_by_name,t.closing_hours,t.metrics_complete,
   coalesce((select string_agg(o.name,', ' order by o.name,o.id) from work w join desk_private.officers o on o.id=w.actor where w.ticket=t.id),'') worked_by
  from cohort t left join desk_private.officers creator on creator.id=t.created_by
   left join desk_private.officers assigned on assigned.id=t.assignee
   left join desk_private.officers responder on responder.id=t.first_response_by
   left join desk_private.officers closer on closer.id=t.closed_by
  where coalesce(p_export,false) order by t.created,t.id limit 50001
 )
 select jsonb_build_object('from',p_from,'to',p_to,'generated_at',clock_timestamp(),
  'tracking_started_at',(select tracking_started_at from desk_private.report_settings where singleton),
  'summary',(select to_jsonb(t) from totals t),
  'officers',coalesce((select jsonb_agg(o order by o.worked_count desc,o.name,o.id) from officers o),'[]'::jsonb),
  'tickets',coalesce((select jsonb_agg(r order by r.created,r.id) from export_rows r),'[]'::jsonb)) into result;
 if coalesce(p_export,false) and (result->'summary'->>'total')::bigint>50000 then
  raise exception 'Choose a shorter date range to export at most 50,000 tickets';
 end if;
 return result;
end;$$;
revoke all on function public.desk_report(date,date,boolean) from public,anon,authenticated;
grant execute on function public.desk_report(date,date,boolean) to authenticated;
create or replace function public.desk_storage_usage() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; used bigint; app_bytes bigint; quota bigint;
begin
 actor:=desk_private.member();
 if actor.manager<>1 then raise exception 'Manager access required' using errcode='42501'; end if;
 used:=pg_database_size(current_database());
 select reference_limit_bytes into quota from desk_private.storage_settings where singleton;
 app_bytes:=pg_total_relation_size('desk_private.tickets'::regclass)+pg_total_relation_size('desk_private.updates'::regclass)+pg_total_relation_size('desk_private.officers'::regclass)+pg_total_relation_size('desk_private.storage_settings'::regclass)+pg_total_relation_size('desk_private.ticket_events'::regclass)+pg_total_relation_size('desk_private.report_settings'::regclass);
 return jsonb_build_object('used_bytes',used,'reference_limit_bytes',quota,
  'remaining_estimate_bytes',greatest(0,quota-used),'app_bytes',app_bytes,
  'ticket_count',(select count(*) from desk_private.tickets),
  'update_count',(select count(*) from desk_private.updates),'checked_at',clock_timestamp());
end;$$;


commit;
