begin;
create or replace function public.desk_submit_guest_ticket(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid();
 name text:=btrim(coalesce(p->>'name','')); email text:=lower(btrim(coalesce(p->>'email','')));
 subject text:=btrim(coalesce(p->>'subject','')); description text:=btrim(coalesce(p->>'description',''));
begin
 if email !~ '^[^@[:space:]]+@smc-bd[.]org$' then raise exception 'Please enter your company email.';end if;
 if length(name) not between 1 and 200 or length(email)>254 or email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
 or length(subject) not between 1 and 200 or length(description) not between 1 and 10000
 or not coalesce(p->>'team' in ('Infrastructure','Software/System','SAP'),false)
 or not desk_private.valid_offices(array[p->>'office']) then raise exception 'Enter valid ticket details';end if;
 insert into desk_private.employee_intake(owner,email,employee,subject,description,team,office,tracking_key)
 values(token,email,name,subject,description,p->>'team',p->>'office',token);
 return token;
end;$$;
commit;
