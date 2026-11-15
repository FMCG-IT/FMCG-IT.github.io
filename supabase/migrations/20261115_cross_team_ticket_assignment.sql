begin;
create or replace function desk_private.desk_write_before_department_roles(p jsonb) returns void language plpgsql security definer set search_path='' as $$
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
  if p ? 'office' and selected_office is null and previous.office is not null then raise exception 'Select an office / area';end if;
  if selected_office is not null then
   if not desk_private.valid_offices(array[selected_office]) then raise exception 'Select a valid office / area';end if;
   select * into assigned from desk_private.officers where id::text=coalesce(p->>'assignee',previous.assignee::text) and not archived for share;
   if assigned.id is null or (p->>'action'='create' and not(selected_office=any(assigned.offices))) then raise exception 'Select an officer responsible for this office / area and team';end if;
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
revoke all on function desk_private.desk_write_before_department_roles(jsonb) from public,anon,authenticated;
commit;
