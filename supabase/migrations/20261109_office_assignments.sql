begin;
alter table desk_private.officers add column if not exists offices text[] not null default '{}';
alter table desk_private.tickets add column if not exists office text;
create or replace function desk_private.valid_offices(p text[]) returns boolean language sql immutable set search_path='' as $$
 select p is not null and cardinality(p) between 1 and 7 and array_position(p,null) is null and p <@ array['FMCG','Rangpur Area Office','Khulna Area Office','Kushtia Area Office','Mymensingh Area Office','Mymensing Pharma','32 Bigha Project']::text[];
$$;
revoke all on function desk_private.valid_offices(text[]) from public,anon,authenticated;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='desk_offices_allowed' and conrelid='desk_private.officers'::regclass) then alter table desk_private.officers add constraint desk_offices_allowed check(cardinality(offices)=0 or desk_private.valid_offices(offices));end if;
 if not exists(select 1 from pg_constraint where conname='desk_ticket_office_allowed' and conrelid='desk_private.tickets'::regclass) then alter table desk_private.tickets add constraint desk_ticket_office_allowed check(office is null or desk_private.valid_offices(array[office]));end if;
end;$$;
create or replace function public.desk_register_officer_with_offices(p_actor uuid,p_account uuid,p_name text,p_section text,p_designation text,p_offices text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare officer_id uuid;
begin
 if not desk_private.valid_offices(p_offices) then raise exception 'Select at least one valid office / area';end if;
 officer_id:=public.desk_register_officer_account(p_actor,p_account,p_name,p_section,p_designation);
 update desk_private.officers set offices=array(select distinct unnest(p_offices) order by 1) where id=officer_id;
 return officer_id;
end;$$;
revoke all on function public.desk_register_officer_with_offices(uuid,uuid,text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.desk_register_officer_with_offices(uuid,uuid,text,text,text,text[]) to service_role;
create or replace function desk_private.ticket_office_insert() returns trigger language plpgsql security definer set search_path='' as $$
begin new.office:=nullif(current_setting('desk.ticket_office',true),'');return new;end;$$;
revoke all on function desk_private.ticket_office_insert() from public,anon,authenticated;
drop trigger if exists desk_ticket_office_insert on desk_private.tickets;
create trigger desk_ticket_office_insert before insert on desk_private.tickets for each row execute function desk_private.ticket_office_insert();
do $$ begin if to_regprocedure('desk_private.desk_write_before_offices(jsonb)') is null then
 alter function public.desk_write(jsonb) rename to desk_write_before_offices;
 alter function public.desk_write_before_offices(jsonb) set schema desk_private;
end if;end;$$;
revoke all on function desk_private.desk_write_before_offices(jsonb) from public,anon,authenticated;
create or replace function public.desk_write(p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; assigned desk_private.officers; previous desk_private.tickets; selected_office text; selected_offices text[];
begin
 actor:=desk_private.member();
 if p->>'action'='officer_edit' and p ? 'offices' then
  if actor.manager<>1 then raise exception 'Manager access required' using errcode='42501';end if;
  if jsonb_typeof(p->'offices')<>'array' then raise exception 'Select responsible offices';end if;
  select array_agg(value) into selected_offices from jsonb_array_elements_text(p->'offices');
  if not desk_private.valid_offices(selected_offices) then raise exception 'Select at least one valid office / area';end if;
  perform desk_private.desk_write_before_offices(p);
  update desk_private.officers set offices=array(select distinct unnest(selected_offices) order by 1) where id::text=p->>'id';
  return;
 elsif p->>'action' in ('create','ticket_edit','update') then
  if p->>'action'<>'create' then
   select * into previous from desk_private.tickets where id=p->>'id' for update;
   if previous.id is null then raise exception 'Ticket not found';end if;
  end if;
  selected_office:=case when p ? 'office' then nullif(p->>'office','') else previous.office end;
  if p->>'action'='create' and selected_office is null then raise exception 'Select an office / area';end if;
  if p ? 'office' and selected_office is null then raise exception 'Select an office / area';end if;
  if selected_office is not null then
   if not desk_private.valid_offices(array[selected_office]) then raise exception 'Select a valid office / area';end if;
   select * into assigned from desk_private.officers where id::text=coalesce(p->>'assignee',previous.assignee::text) and not archived for share;
   if assigned.id is null or not(selected_office=any(assigned.offices)) then raise exception 'Select an officer responsible for this office / area and team';end if;
   p:=p||jsonb_build_object('team',coalesce(p->>'team',desk_private.section_for(assigned.specialty)),'assignee',assigned.id);
  end if;
  if p->>'action'='create' then
   perform set_config('desk.ticket_office',coalesce(selected_office,''),true);
   perform desk_private.desk_write_before_offices(p);
   perform set_config('desk.ticket_office','',true);
   return;
  end if;
  perform desk_private.desk_write_before_offices(p);
  if selected_office is distinct from previous.office then
   update desk_private.tickets set office=selected_office where id=previous.id;
   insert into desk_private.updates(ticket,body,internal,author) values(previous.id,'Office / area changed to '||selected_office,1,actor.name);
  end if;
  return;
 elsif p->>'action'='officer_delete' then
  if exists(select 1 from desk_private.tickets t where t.assignee::text=p->>'id' and t.office is not null and not exists(select 1 from desk_private.officers o where o.id::text=p->>'replacement' and not o.archived and t.office=any(o.offices))) then raise exception 'Replacement officer must cover all offices of the assigned tickets';end if;
 end if;
 perform desk_private.desk_write_before_offices(p);
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
  select t.office,t.id,t.ticket_number,t.title,t.created,
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

commit;
