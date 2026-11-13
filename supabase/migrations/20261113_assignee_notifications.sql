begin;
create or replace function desk_private.notify_ticket() returns trigger language plpgsql security definer set search_path='' as $$
declare t desk_private.tickets; actor uuid; recipient_id uuid;
begin
 select id into actor from desk_private.officers where account=auth.uid() and not archived;
 if tg_table_name='updates' then select * into t from desk_private.tickets where id=new.ticket;
 else t:=new; if tg_op='UPDATE' and old is not distinct from new then return new; end if; end if;
 for recipient_id in select distinct o.id from desk_private.officers o where not o.archived and o.id in(t.assignee,t.created_by) and (o.id=t.assignee or o.id is distinct from actor) loop
 insert into desk_private.notifications(recipient,ticket,message) values(recipient_id,t.id,case when tg_op='INSERT' and tg_table_name='tickets' then 'Ticket assigned: ' else 'Ticket updated: ' end||left(t.title,200))
 on conflict(recipient,ticket) do update set message=excluded.message,updated_at=clock_timestamp(),read_at=null;
 end loop;return new;
end;$$;
revoke all on function desk_private.notify_ticket() from public,anon,authenticated;
drop trigger if exists desk_ticket_notify on desk_private.tickets;
create trigger desk_ticket_notify after insert or update on desk_private.tickets for each row execute function desk_private.notify_ticket();
create table if not exists desk_private.project_notifications (
 recipient uuid not null references desk_private.officers(id),
 project bigint not null references desk_private.projects(id) on delete cascade,
 message text not null,
 updated_at timestamptz not null default clock_timestamp(),
 read_at timestamptz,
 primary key(recipient,project)
);
alter table desk_private.project_notifications enable row level security;
revoke all on desk_private.project_notifications from public,anon,authenticated;

create or replace function desk_private.notify_project() returns trigger
language plpgsql security definer set search_path='' as $$
declare prefix text:='Project updated: ';
begin
 if new.approval_status<>'Approved' then return new;end if;
 if tg_op='UPDATE' then
  if old is not distinct from new then return new;end if;
  if old.approval_status='Pending' then prefix:='Project approved: ';
  elsif old.assignee is distinct from new.assignee then prefix:='Project assigned: ';end if;
 else prefix:='Project assigned: ';
 end if;
 if exists(select 1 from desk_private.officers where id=new.assignee and not archived) then
  insert into desk_private.project_notifications(recipient,project,message)
  values(new.assignee,new.id,prefix||new.subject)
  on conflict(recipient,project) do update set message=excluded.message,updated_at=clock_timestamp(),read_at=null;
 end if;
 return new;
end;$$;
revoke all on function desk_private.notify_project() from public,anon,authenticated;
drop trigger if exists desk_project_notify on desk_private.projects;
create trigger desk_project_notify after insert or update on desk_private.projects
 for each row execute function desk_private.notify_project();

create or replace function public.desk_project_notifications(p_project bigint default null,p_seen_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers;
begin
 actor:=desk_private.member();
 if p_project is not null and p_seen_at is not null then
  update desk_private.project_notifications set read_at=clock_timestamp()
   where recipient=actor.id and project=p_project and updated_at<=p_seen_at and read_at is null;
 end if;
 return jsonb_build_object(
  'unread',(select count(*) from desk_private.project_notifications where recipient=actor.id and read_at is null),
  'items',coalesce((select jsonb_agg(n order by n.updated_at desc) from (
   select project,message,updated_at,read_at from desk_private.project_notifications where recipient=actor.id
   order by updated_at desc limit 30
  ) n),'[]'::jsonb));
end;$$;
revoke all on function public.desk_project_notifications(bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.desk_project_notifications(bigint,timestamptz) to authenticated;
commit;
