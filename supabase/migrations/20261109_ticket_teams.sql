begin;
do $$ begin if to_regprocedure('desk_private.desk_write_before_ticket_teams(jsonb)') is null then
 alter function public.desk_write(jsonb) rename to desk_write_before_ticket_teams;
 alter function public.desk_write_before_ticket_teams(jsonb) set schema desk_private;
end if;end;$$;
revoke all on function desk_private.desk_write_before_ticket_teams(jsonb) from public,anon,authenticated;
create or replace function public.desk_write(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; assigned desk_private.officers; previous desk_private.tickets; selected_team text;
begin
 actor:=desk_private.member();
 if p->>'action' in ('create','update','ticket_edit') and p ? 'team' then
  selected_team:=p->>'team';
  if selected_team is null or selected_team not in ('Infrastructure','Software/System','SAP') then raise exception 'Select a valid team';end if;
  select * into assigned from desk_private.officers where id::text=p->>'assignee' and not archived for share;
  if assigned.id is null or desk_private.section_for(assigned.specialty)<>selected_team then raise exception 'Select an active officer from the selected team';end if;
  if p->>'action' in ('create','ticket_edit') then
   p:=p||jsonb_build_object('category',case selected_team when 'Infrastructure' then 'Hardware' when 'SAP' then 'SAP' else 'Software' end);
  end if;
  if p->>'action'='ticket_edit' then
   select * into previous from desk_private.tickets where id=p->>'id' for update;
   if previous.id is null then raise exception 'Ticket not found';end if;
   perform desk_private.desk_write_before_ticket_teams(p);
   if previous.assignee<>assigned.id then
    perform desk_private.desk_write_before_ticket_teams(jsonb_build_object('action','update','id',previous.id,'status',previous.status,'assignee',assigned.id,'body',''));
   end if;
   return;
  end if;
 end if;
 perform desk_private.desk_write_before_ticket_teams(p);
end;$$;
revoke all on function public.desk_write(jsonb) from public,anon,authenticated;
grant execute on function public.desk_write(jsonb) to authenticated;
commit;
