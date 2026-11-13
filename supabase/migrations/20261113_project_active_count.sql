begin;
create or replace function public.desk_projects(p_count_only boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform desk_private.member();
 if p_count_only then
  return to_jsonb((select count(*) from desk_private.projects where status in ('New project','Ongoing project')));
 end if;
 return coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('creator_name',c.name,'assignee_name',a.name) order by p.id desc)
  from desk_private.projects p join desk_private.officers c on c.id=p.created_by join desk_private.officers a on a.id=p.assignee),'[]'::jsonb);
end;$$;

commit;
