-- Run in the Supabase SQL Editor after signing up and confirming your email.
-- Replace both placeholders first. Repeat is a no-op if the email is already listed.
do $$
declare manager_email text := lower('YOUR_EMAIL@example.com');
declare manager_name text := 'YOUR NAME';
declare manager_id uuid;
begin
 select id into manager_id from auth.users where lower(email)=manager_email and email_confirmed_at is not null;
 if manager_id is null then raise exception 'No confirmed account found for this email'; end if;
 insert into desk_private.officers(account,email,name,specialty,manager)
 values(manager_id,manager_email,manager_name,'IT Manager',1)
 on conflict (email) do nothing;
end;$$;
