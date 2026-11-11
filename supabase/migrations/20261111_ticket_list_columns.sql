begin;
drop function if exists public.desk_ticket_list_filtered(text,text,uuid,text,integer,integer,text,date,date);
create or replace function public.desk_ticket_list_filtered(
 p_search text default '',p_status text default null,p_assignee uuid default null,
 p_section text default null,p_offset integer default 0,p_limit integer default 25,
 p_priority text default null,p_created_from date default null,p_created_to date default null,p_sort text default 'updated_desc'
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers; result jsonb;
begin
 actor:=desk_private.member();
 if p_sort is null or p_sort not in ('updated_desc','created_desc','created_asc','priority_desc','updated_asc','title_asc','title_desc','assignee_asc','assignee_desc','priority_asc','status_asc','status_desc','comment_asc','comment_desc','number_asc','number_desc','creator_asc','creator_desc') then raise exception 'Invalid ticket sort';end if;
 if p_priority is not null and p_priority not in ('Low','Medium','High','Critical') then raise exception 'Invalid priority'; end if;
 if p_created_from is not null and p_created_to is not null and p_created_from>p_created_to then raise exception 'From date must be before or equal to the to date'; end if;
 if p_status is not null and p_status not in ('New ticket','In progress','Closed') then raise exception 'Invalid status'; end if;
 if p_section is not null and p_section not in ('Infrastructure','Software/System','SAP') then raise exception 'Invalid section'; end if;
 if length(coalesce(p_search,''))>200 then raise exception 'Search is too long'; end if;
 with summaries as (
  select t.office,t.due_at,t.id,t.ticket_number,t.title,t.employee,t.department,t.assignee,t.priority,t.status,t.created,
   coalesce(activity.created,t.created) last_update_at,
   case when comment.id is null then null else jsonb_build_object('body',left(comment.body,500),'internal',comment.internal) end last_comment,
   comment.body comment_search,o.name assignee_name,creator.name creator_name
  from desk_private.tickets t join desk_private.officers o on o.id=t.assignee
  left join desk_private.officers creator on creator.id=t.created_by
  left join lateral (select u.created from desk_private.updates u where u.ticket=t.id order by u.created desc,u.id desc limit 1) activity on true
  left join lateral (
   select u.id,u.body,u.internal from desk_private.updates u where u.ticket=t.id and
    (u.internal=1 or (u.body<>'Ticket registered. The IT team will review the issue.' and
     u.body !~ '^Status: (New ticket|In progress|Closed|Open|In Progress|Waiting for User|Waiting for Parts / Vendor|Resolved)[.] Assigned to '))
   order by u.created desc,u.id desc limit 1
  ) comment on true
  where (p_status is null or t.status=p_status) and (p_assignee is null or t.assignee=p_assignee)
   and (p_section is null or desk_private.section_for(o.specialty)=p_section)
   and (p_priority is null or t.priority=p_priority)
   and (p_created_from is null or t.created >= (p_created_from::timestamp at time zone 'Asia/Dhaka'))
   and (p_created_to is null or t.created < ((p_created_to+1)::timestamp at time zone 'Asia/Dhaka'))
 ), matching as (
  select * from summaries s where coalesce(btrim(p_search),'')='' or
   strpos(lower(concat_ws(' ',s.id,'IT-'||lpad(s.ticket_number::text,8,'0'),s.title,s.employee,s.department,s.assignee_name,s.creator_name,s.priority,s.status,s.comment_search)),lower(btrim(p_search)))>0
 ), page as (
  select office,due_at,id,ticket_number,title,assignee,priority,status,created,last_update_at,last_comment,assignee_name,creator_name
   from matching order by case when p_sort='updated_asc' then last_update_at end asc nulls last,
 case when p_sort='updated_desc' then last_update_at end desc nulls last,
 case when p_sort='created_asc' then created end asc nulls last,
 case when p_sort='created_desc' then created end desc nulls last,
 case when p_sort='number_asc' then ticket_number end asc nulls last,
 case when p_sort='number_desc' then ticket_number end desc nulls last,
 case when p_sort='creator_asc' then lower(creator_name) end asc nulls last,
 case when p_sort='creator_desc' then lower(creator_name) end desc nulls last,
 case when p_sort='title_asc' then lower(title) end asc nulls last,
 case when p_sort='title_desc' then lower(title) end desc nulls last,
 case when p_sort='assignee_asc' then lower(assignee_name) end asc nulls last,
 case when p_sort='assignee_desc' then lower(assignee_name) end desc nulls last,
 case when p_sort='priority_asc' then case priority when 'Critical' then 4 when 'Urgent' then 4 when 'High' then 3 when 'Medium' then 2 else 1 end end asc nulls last,
 case when p_sort='priority_desc' then case priority when 'Critical' then 4 when 'Urgent' then 4 when 'High' then 3 when 'Medium' then 2 else 1 end end desc nulls last,
 case when p_sort='status_asc' then case status when 'New ticket' then 1 when 'In progress' then 2 else 3 end end asc nulls last,
 case when p_sort='status_desc' then case status when 'New ticket' then 1 when 'In progress' then 2 else 3 end end desc nulls last,
 case when p_sort='comment_asc' then lower(last_comment->>'body') end asc nulls last,
 case when p_sort='comment_desc' then lower(last_comment->>'body') end desc nulls last,
 last_update_at desc,id desc
   offset greatest(0,coalesce(p_offset,0)) limit least(50,greatest(1,coalesce(p_limit,25)))
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(p order by case when p_sort='updated_asc' then last_update_at end asc nulls last,
 case when p_sort='updated_desc' then last_update_at end desc nulls last,
 case when p_sort='created_asc' then created end asc nulls last,
 case when p_sort='created_desc' then created end desc nulls last,
 case when p_sort='number_asc' then ticket_number end asc nulls last,
 case when p_sort='number_desc' then ticket_number end desc nulls last,
 case when p_sort='creator_asc' then lower(creator_name) end asc nulls last,
 case when p_sort='creator_desc' then lower(creator_name) end desc nulls last,
 case when p_sort='title_asc' then lower(title) end asc nulls last,
 case when p_sort='title_desc' then lower(title) end desc nulls last,
 case when p_sort='assignee_asc' then lower(assignee_name) end asc nulls last,
 case when p_sort='assignee_desc' then lower(assignee_name) end desc nulls last,
 case when p_sort='priority_asc' then case priority when 'Critical' then 4 when 'Urgent' then 4 when 'High' then 3 when 'Medium' then 2 else 1 end end asc nulls last,
 case when p_sort='priority_desc' then case priority when 'Critical' then 4 when 'Urgent' then 4 when 'High' then 3 when 'Medium' then 2 else 1 end end desc nulls last,
 case when p_sort='status_asc' then case status when 'New ticket' then 1 when 'In progress' then 2 else 3 end end asc nulls last,
 case when p_sort='status_desc' then case status when 'New ticket' then 1 when 'In progress' then 2 else 3 end end desc nulls last,
 case when p_sort='comment_asc' then lower(last_comment->>'body') end asc nulls last,
 case when p_sort='comment_desc' then lower(last_comment->>'body') end desc nulls last,
 last_update_at desc,id desc) from page p),'[]'::jsonb),
  'total',(select count(*) from matching)) into result;
 return result;
end;$$;


revoke all on function public.desk_ticket_list_filtered(text,text,uuid,text,integer,integer,text,date,date,text) from public,anon,authenticated;
grant execute on function public.desk_ticket_list_filtered(text,text,uuid,text,integer,integer,text,date,date,text) to authenticated;
commit;
