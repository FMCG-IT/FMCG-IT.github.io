begin;
create or replace function public.desk_manage_coverage_area(p_old text,p_new text default null) returns void
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers;
 clean_name text:=btrim(regexp_replace(coalesce(p_new,''),'[[:space:]]+',' ','g'));
 old_key text;
begin
 actor:=desk_private.member();
 if actor.manager<>1 then raise exception 'Overall IT Manager access required' using errcode='42501';end if;
 lock table desk_private.employee_intake,desk_private.officers,desk_private.projects,desk_private.tickets in share row exclusive mode;
 select normalized into old_key from desk_private.coverage_areas where name=p_old for update;
 if not found then raise exception 'Coverage area not found';end if;
 if p_new is null then
  if exists(select 1 from desk_private.officers where p_old=any(offices))
   or exists(select 1 from desk_private.tickets where office=p_old)
   or exists(select 1 from desk_private.projects where office=p_old)
   or exists(select 1 from desk_private.employee_intake where office=p_old)
   then raise exception 'This area is in use. Remove member assignments first. Areas used by tickets or projects can be renamed.';end if;
  delete from desk_private.coverage_areas where normalized=old_key;
  return;
 end if;
 if length(clean_name) not between 1 and 100 then raise exception 'Enter an area name between 1 and 100 characters';end if;
 if clean_name=p_old then return;end if;
 if lower(clean_name)=old_key then
  update desk_private.coverage_areas set name=clean_name where normalized=old_key;
 else
  insert into desk_private.coverage_areas(name) values(clean_name) on conflict do nothing;
  if not found then raise exception 'This coverage area already exists';end if;
 end if;
 update desk_private.officers set offices=array_replace(offices,p_old,clean_name) where p_old=any(offices);
 update desk_private.tickets set office=clean_name where office=p_old;
 update desk_private.projects set office=clean_name where office=p_old;
 update desk_private.employee_intake set office=clean_name where office=p_old;
 if lower(clean_name)<>old_key then delete from desk_private.coverage_areas where normalized=old_key;end if;
end;$$;
revoke all on function public.desk_manage_coverage_area(text,text) from public,anon,authenticated;
grant execute on function public.desk_manage_coverage_area(text,text) to authenticated;
commit;
