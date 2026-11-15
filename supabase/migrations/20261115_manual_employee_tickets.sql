begin;
alter table desk_private.employee_intake add column if not exists tracking_key uuid unique;
alter table desk_private.tickets add column if not exists requester_name text, add column if not exists requester_email text;
update desk_private.tickets t set requester_name=r.employee,requester_email=r.email
 from desk_private.employee_intake r where r.ticket=t.id and t.requester_name is null;
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
  insert into desk_private.tickets(title,employee,description,category,priority,assignee,requester_name,requester_email)
  values(r.subject,r.employee,r.description,case r.team when 'SAP' then 'SAP' when 'Infrastructure' then 'Hardware' else 'Software' end,'Medium',assigned.id,r.employee,r.email)
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
   comment.body comment_search,o.name assignee_name,coalesce(t.requester_name,creator.name) creator_name
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


create or replace function public.desk_submit_guest_ticket(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid();
 name text:=btrim(coalesce(p->>'name','')); email text:=lower(btrim(coalesce(p->>'email','')));
 subject text:=btrim(coalesce(p->>'subject','')); description text:=btrim(coalesce(p->>'description',''));
begin
 if length(name) not between 1 and 200 or length(email)>254 or email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
 or length(subject) not between 1 and 200 or length(description) not between 1 and 10000
 or not coalesce(p->>'team' in ('Infrastructure','Software/System','SAP'),false)
 or not desk_private.valid_offices(array[p->>'office']) then raise exception 'Enter valid ticket details';end if;
 insert into desk_private.employee_intake(owner,email,employee,subject,description,team,office,tracking_key)
 values(token,email,name,subject,description,p->>'team',p->>'office',token);
 return token;
end;$$;
create or replace function public.desk_guest_ticket(p_key uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('subject',r.subject,'status',coalesce(t.status,'Awaiting assignment'),
 'updates',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'body',u.body) order by u.created desc,u.id desc)
 from desk_private.updates u where u.ticket=t.id and u.internal=0),'[]'::jsonb))
 from desk_private.employee_intake r left join desk_private.tickets t on t.id=r.ticket where r.tracking_key=p_key;
$$;
revoke all on function public.desk_submit_guest_ticket(jsonb),public.desk_guest_ticket(uuid) from public,anon,authenticated;
grant execute on function public.desk_submit_guest_ticket(jsonb),public.desk_guest_ticket(uuid) to anon,authenticated;
commit;
