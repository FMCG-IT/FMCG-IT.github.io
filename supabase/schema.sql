begin;
create schema if not exists desk_private;
revoke all on schema desk_private from public, anon, authenticated;

create table if not exists desk_private.officers (
 id uuid primary key default gen_random_uuid(),
 account uuid unique references auth.users(id) on delete set null,
 email text unique not null check (email=lower(email)),
 name text not null, specialty text not null, manager integer not null default 0
);
create table if not exists desk_private.tickets (
 id text primary key default ('IT-'||upper(replace(gen_random_uuid()::text,'-',''))),
 token text unique not null default (replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')),
 title text not null, employee text not null, department text not null default '',
 category text not null, priority text not null, assignee uuid not null references desk_private.officers(id),
 status text not null default 'New ticket' check(status in ('New ticket','In progress','Closed')),
 description text not null default '', created timestamptz not null default now()
);
create table if not exists desk_private.updates (
 id uuid primary key default gen_random_uuid(), ticket text not null references desk_private.tickets(id),
 body text not null, internal integer not null default 0, author text not null, created timestamptz not null default clock_timestamp()
);
create index if not exists desk_updates_ticket on desk_private.updates(ticket,created);
alter table desk_private.officers enable row level security;
alter table desk_private.tickets enable row level security;
alter table desk_private.updates enable row level security;
revoke all on all tables in schema desk_private from public, anon, authenticated;

create or replace function desk_private.member() returns desk_private.officers
language plpgsql security definer set search_path = '' as $$
declare officer desk_private.officers;
begin
 select o.* into officer from desk_private.officers o where o.account=auth.uid();
 if officer.id is null and auth.uid() is not null then
  update desk_private.officers o set account=auth.uid()
   from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
   and o.account is null and o.manager=0 and o.email=lower(u.email)
   returning o.* into officer;
 end if;
 if officer.id is null then raise exception 'Your account is not in the IT team.' using errcode='42501'; end if;
 return officer;
end;$$;
revoke all on function desk_private.member() from public, anon, authenticated;

create or replace function public.desk_read() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare officer desk_private.officers;
begin
 officer := desk_private.member();
 return jsonb_build_object(
  'me',to_jsonb(officer)-'account',
  'team',coalesce((select jsonb_agg(to_jsonb(o)-'account') from desk_private.officers o),'[]'::jsonb),
  'tickets',coalesce((select jsonb_agg(t order by t.created desc) from desk_private.tickets t),'[]'::jsonb),
  'updates',coalesce((select jsonb_agg(u order by u.created desc) from desk_private.updates u),'[]'::jsonb)
 );
end;$$;

create or replace function public.desk_write(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare officer desk_private.officers; previous desk_private.tickets; assignee_row desk_private.officers;
 action text:=p->>'action'; ticket_id text; email text:=lower(btrim(coalesce(p->>'email','')));
 body text:=btrim(coalesce(p->>'body','')); next_status text:=p->>'status';
begin
 officer := desk_private.member();
 if action='officer' then
  if officer.manager<>1 then raise exception 'Manager access required' using errcode='42501'; end if;
  if email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' or length(email)>250 or btrim(coalesce(p->>'name',''))='' then raise exception 'Enter a name and valid email'; end if;
  insert into desk_private.officers(email,name,specialty) values(email,left(btrim(p->>'name'),150),left(coalesce(p->>'specialty','IT Support'),100));
 elsif action in ('create','update') then
  select o.* into assignee_row from desk_private.officers o where o.id::text=p->>'assignee';
  if assignee_row.id is null then raise exception 'Select an officer'; end if;
  if action='create' then
   if btrim(coalesce(p->>'title',''))='' or btrim(coalesce(p->>'employee',''))='' then raise exception 'Title and employee are required'; end if;
   insert into desk_private.tickets(title,employee,department,category,priority,assignee,description)
   values(left(p->>'title',200),left(p->>'employee',200),left(coalesce(p->>'department',''),200),
    left(coalesce(p->>'category','Support'),100),case when p->>'priority' in ('Low','Medium','High','Critical') then p->>'priority' else 'Medium' end,
    assignee_row.id,left(coalesce(p->>'description',''),10000)) returning id into ticket_id;
   insert into desk_private.updates(ticket,body,author) values(ticket_id,'Ticket registered. The IT team will review the issue.',officer.name);
  else
   if next_status is null or next_status not in ('New ticket','In progress','Closed') then raise exception 'Invalid status'; end if;
   select t.* into previous from desk_private.tickets t where t.id=p->>'id' for update;
   if previous.id is null then raise exception 'Ticket not found'; end if;
   update desk_private.tickets set status=next_status,assignee=assignee_row.id where id=previous.id;
   if previous.status<>next_status or previous.assignee<>assignee_row.id then
    insert into desk_private.updates(ticket,body,author)
    values(previous.id,'Status: '||next_status||'. Assigned to '||assignee_row.name||'.',officer.name);
   end if;
   if body<>'' then
    insert into desk_private.updates(ticket,body,internal,author)
    values(previous.id,left(body,10000),case when p->'internal'='true'::jsonb then 1 else 0 end,officer.name);
   end if;
  end if;
 elsif action='rotate' then
  update desk_private.tickets set token=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','') where id=p->>'id';
  if not found then raise exception 'Ticket not found'; end if;
 else raise exception 'Unknown action';
 end if;
end;$$;

create or replace function public.desk_track(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
   'id',t.id,'title',t.title,'status',t.status,'officer',o.name,
   'updates',coalesce((select jsonb_agg(jsonb_build_object('body',u.body,'author',u.author,'created',u.created) order by u.created desc)
      from desk_private.updates u where u.ticket=t.id and u.internal=0),'[]'::jsonb)
 )
 from desk_private.tickets t join desk_private.officers o on o.id=t.assignee
 where p_token ~ '^[a-f0-9]{64}$' and t.token=p_token
$$;
revoke all on function public.desk_read(), public.desk_write(jsonb), public.desk_track(text) from public, anon, authenticated;
grant execute on function public.desk_read(), public.desk_write(jsonb) to authenticated;
grant execute on function public.desk_track(text) to anon, authenticated;
commit;
