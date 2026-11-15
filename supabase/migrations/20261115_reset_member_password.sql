begin;
create or replace function public.desk_member_reset_account(p_actor uuid,p_officer uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from desk_private.officers where account=p_actor and manager=1 and not archived) then
  raise exception 'Manager access required' using errcode='42501';
 end if;
 return (select account from desk_private.officers where id=p_officer and manager=0 and not archived and account is distinct from p_actor);
end;$$;
revoke all on function public.desk_member_reset_account(uuid,uuid) from public,anon,authenticated;
grant execute on function public.desk_member_reset_account(uuid,uuid) to service_role;
commit;
