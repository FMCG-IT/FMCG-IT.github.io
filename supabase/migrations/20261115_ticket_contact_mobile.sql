begin;
alter table desk_private.tickets add column if not exists contact_mobile text;
alter table desk_private.employee_intake add column if not exists contact_mobile text;
create or replace function desk_private.clean_contact_mobile(p_number text) returns text
language plpgsql immutable set search_path='' as $$
declare cleaned text:=nullif(btrim(p_number),'');
begin
 if cleaned is not null and (length(cleaned)>30
  or cleaned !~ '^[+]?[0-9() -]+$'
  or length(regexp_replace(cleaned,'[^0-9]','','g')) not between 7 and 15)
  then raise exception 'Enter a valid contact mobile number';end if;
 return cleaned;
end;$$;
revoke all on function desk_private.clean_contact_mobile(text) from public,anon,authenticated;

create or replace function desk_private.ticket_mobile_insert() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.contact_mobile is null then
  new.contact_mobile:=nullif(current_setting('desk.ticket_mobile',true),'');
 end if;
 return new;
end;$$;
revoke all on function desk_private.ticket_mobile_insert() from public,anon,authenticated;
drop trigger if exists desk_ticket_mobile_insert on desk_private.tickets;
create trigger desk_ticket_mobile_insert before insert on desk_private.tickets
 for each row execute function desk_private.ticket_mobile_insert();

do $$ begin
 if to_regprocedure('desk_private.desk_write_before_contact_mobile(jsonb)') is null then
  alter function public.desk_write(jsonb) rename to desk_write_before_contact_mobile;
  alter function public.desk_write_before_contact_mobile(jsonb) set schema desk_private;
 end if;
end;$$;
revoke all on function desk_private.desk_write_before_contact_mobile(jsonb) from public,anon,authenticated;
create or replace function public.desk_write(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare mobile text;
begin
 if p->>'action'='create' then
  mobile:=desk_private.clean_contact_mobile(p->>'contact_mobile');
  perform set_config('desk.ticket_mobile',coalesce(mobile,''),true);
  perform desk_private.desk_write_before_contact_mobile(p);
  perform set_config('desk.ticket_mobile','',true);
 elsif p->>'action'='ticket_edit' and p ? 'contact_mobile' then
  mobile:=desk_private.clean_contact_mobile(p->>'contact_mobile');
  perform desk_private.desk_write_before_contact_mobile(p);
  update desk_private.tickets set contact_mobile=mobile where id=p->>'id' and contact_mobile is distinct from mobile;
 else
  perform desk_private.desk_write_before_contact_mobile(p);
 end if;
end;$$;
revoke all on function public.desk_write(jsonb) from public,anon,authenticated;
grant execute on function public.desk_write(jsonb) to authenticated;

create or replace function public.desk_intake_queue(p_id bigint default null,p_assignee uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; r desk_private.employee_intake; assigned desk_private.officers; ticket_id text;
begin
 actor:=desk_private.member();
 if actor.manager<>1 and actor.department_role<>'manager' then
  if p_id is not null then raise exception 'Manager access required' using errcode='42501';end if;
  return '[]'::jsonb;
 end if;
 if p_id is not null then
  select * into r from desk_private.employee_intake where id=p_id and ticket is null for update;
  if r.id is null or (actor.manager<>1 and desk_private.section_for(actor.specialty)<>r.team)
   then raise exception 'Ticket unavailable for assignment' using errcode='42501';end if;
  select * into assigned from desk_private.officers where id=p_assignee and not archived for share;
  if assigned.id is null or desk_private.section_for(assigned.specialty)<>r.team
   or not (r.office=any(assigned.offices)) then raise exception 'Choose an officer covering this team and office';end if;
  perform set_config('desk.ticket_office',r.office,true);
  insert into desk_private.tickets(title,employee,description,category,priority,assignee,requester_name,requester_email,contact_mobile)
  values(r.subject,r.employee,r.description,case r.team when 'SAP' then 'SAP' when 'Infrastructure' then 'Hardware' else 'Software' end,'Medium',assigned.id,r.employee,r.email,r.contact_mobile)
  returning id into ticket_id;
  perform set_config('desk.ticket_office','',true);
  update desk_private.employee_intake set ticket=ticket_id where id=r.id;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'subject',q.subject,'description',q.description,
 'employee',q.employee,'email',q.email,'contact_mobile',q.contact_mobile,'team',q.team,'office',q.office,'officers',coalesce((
 select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name) order by o.name)
 from desk_private.officers o where not o.archived and desk_private.section_for(o.specialty)=q.team and q.office=any(o.offices)
 ),'[]'::jsonb)) order by q.id desc) from desk_private.employee_intake q
 where q.ticket is null and (actor.manager=1 or q.team=desk_private.section_for(actor.specialty))),'[]'::jsonb);
end;$$;
create or replace function public.desk_submit_guest_ticket(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid();
 name text:=btrim(coalesce(p->>'name','')); email text:=lower(btrim(coalesce(p->>'email','')));
 subject text:=btrim(coalesce(p->>'subject','')); description text:=btrim(coalesce(p->>'description',''));
begin
 if email !~ '^[^@[:space:]]+@smc-bd[.]org$' then raise exception 'Please enter your company email.';end if;
 if length(name) not between 1 and 200 or length(email)>254 or email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
 or length(subject) not between 1 and 200 or length(description) not between 1 and 10000
 or not coalesce(p->>'team' in ('Infrastructure','Software/System','SAP'),false)
 or not desk_private.valid_offices(array[p->>'office']) then raise exception 'Enter valid ticket details';end if;
 insert into desk_private.employee_intake(owner,email,employee,subject,description,team,office,tracking_key,contact_mobile)
 values(token,email,name,subject,description,p->>'team',p->>'office',token,desk_private.clean_contact_mobile(p->>'contact_mobile'));
 return token;
end;$$;
commit;
