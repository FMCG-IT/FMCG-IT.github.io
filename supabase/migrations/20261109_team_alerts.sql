begin;
create or replace function public.desk_bootstrap() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; summary jsonb; officer_counts jsonb;
begin
 actor:=desk_private.member();
 select coalesce(jsonb_object_agg(s.status,s.n),'{}'::jsonb) into summary from
  (select status,count(*) n from desk_private.tickets group by status) s;
 select coalesce(jsonb_object_agg(x.assignee,x.counts),'{}'::jsonb) into officer_counts from
  (select a.assignee,jsonb_object_agg(a.status,a.n) counts from
   (select assignee,status,count(*) n from desk_private.tickets group by assignee,status) a group by a.assignee) x;
 return jsonb_build_object(
  'me',to_jsonb(actor)-'account',
  'team',coalesce((select jsonb_agg(to_jsonb(o)-'account' order by o.name,o.id) from desk_private.officers o),'[]'::jsonb),
  'counts',jsonb_build_object('statuses',summary,'byOfficer',officer_counts,
   'sectionAlerts',coalesce((select jsonb_object_agg(s.section,jsonb_build_object('active',s.active,'earliest_due',s.earliest_due)) from (
    select desk_private.section_for(o.specialty) section,count(*) active,
     min(t.created+case t.priority when 'Low' then interval '720 hours' when 'Medium' then interval '240 hours' when 'High' then interval '72 hours' when 'Critical' then interval '24 hours' when 'Urgent' then interval '24 hours' else interval '240 hours' end) earliest_due
    from desk_private.tickets t join desk_private.officers o on o.id=t.assignee
    where t.status in ('New ticket','In progress') and not o.archived
    group by desk_private.section_for(o.specialty)
   )s),'{}'::jsonb),
   'total',(select count(*) from desk_private.tickets)));
end;$$;

revoke all on function public.desk_bootstrap() from public,anon,authenticated;
grant execute on function public.desk_bootstrap() to authenticated;
commit;
