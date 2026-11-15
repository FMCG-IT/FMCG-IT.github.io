begin;
create table if not exists desk_private.employee_domains(domain text primary key);
create table if not exists desk_private.employee_intake(
 id bigint generated always as identity primary key,
 owner uuid not null,
 email text not null,
 employee text not null,
 subject text not null,
 description text not null,
 team text not null,
 office text not null,
 created timestamptz not null default now(),
 ticket text unique references desk_private.tickets(id) on delete cascade
);
alter table desk_private.employee_domains enable row level security;
alter table desk_private.employee_intake enable row level security;
revoke all on desk_private.employee_domains,desk_private.employee_intake from public,anon,authenticated;

create or replace function desk_private.employee_identity() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('email',u.email,'name',left(coalesce(nullif(i.identity_data->>'full_name',''),nullif(i.identity_data->>'name',''),split_part(u.email,'@',1)),200))
 from auth.users u join auth.identities i on i.user_id=u.id and i.provider='azure'
 join desk_private.employee_domains d on d.domain=split_part(lower(u.email),'@',2)
 where u.id=auth.uid() and u.email_confirmed_at is not null and lower(i.identity_data->>'email')=lower(u.email)
 limit 1;
$$;
revoke all on function desk_private.employee_identity() from public,anon,authenticated;
create or replace function public.desk_portal_access() returns text
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return 'denied';end if;
 begin
  perform desk_private.member();
  return 'it';
 exception when insufficient_privilege then null;
 end;
 if desk_private.employee_identity() is not null then return 'employee';end if;
 return 'denied';
end;$$;

create or replace function public.desk_employee_tickets(p jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare identity jsonb:=desk_private.employee_identity();
 subject text:=btrim(coalesce(p->>'subject','')); description text:=btrim(coalesce(p->>'description',''));
begin
 if identity is null then raise exception 'Company Microsoft account required' using errcode='42501';end if;
 if p is not null then
  if length(subject) not between 1 and 200 or length(description) not between 1 and 10000
   or not coalesce(p->>'team' in ('Infrastructure','Software/System','SAP'),false)
   or not desk_private.valid_offices(array[p->>'office']) then raise exception 'Enter a valid subject, description, team and office';end if;
  insert into desk_private.employee_intake(owner,email,employee,subject,description,team,office)
   values(auth.uid(),identity->>'email',identity->>'name',subject,description,p->>'team',p->>'office');
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'subject',r.subject,'description',r.description,
 'team',r.team,'office',r.office,'created',r.created,'ticket',t.ticket_number,'status',coalesce(t.status,'Awaiting assignment'),
 'updates',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'body',u.body,'created',u.created) order by u.created desc,u.id desc)
 from desk_private.updates u where u.ticket=t.id and u.internal=0),'[]'::jsonb)) order by r.id desc)
 from desk_private.employee_intake r left join desk_private.tickets t on t.id=r.ticket where r.owner=auth.uid()),'[]'::jsonb);
end;$$;

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
  insert into desk_private.tickets(title,employee,description,category,priority,assignee)
  values(r.subject,r.employee,r.description,case r.team when 'SAP' then 'SAP' when 'Infrastructure' then 'Hardware' else 'Software' end,'Medium',assigned.id)
  returning id into ticket_id;
  perform set_config('desk.ticket_office','',true);
  update desk_private.employee_intake set ticket=ticket_id where id=r.id;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'subject',q.subject,'description',q.description,
 'employee',q.employee,'email',q.email,'team',q.team,'office',q.office,'officers',coalesce((
 select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name) order by o.name)
 from desk_private.officers o where not o.archived and desk_private.section_for(o.specialty)=q.team and q.office=any(o.offices)
 ),'[]'::jsonb)) order by q.id desc) from desk_private.employee_intake q
 where q.ticket is null and (actor.manager=1 or q.team=desk_private.section_for(actor.specialty))),'[]'::jsonb);
end;$$;
revoke all on function public.desk_portal_access(),public.desk_employee_tickets(jsonb),public.desk_intake_queue(bigint,uuid) from public,anon,authenticated;
grant execute on function public.desk_portal_access(),public.desk_employee_tickets(jsonb),public.desk_intake_queue(bigint,uuid) to authenticated;
commit;
