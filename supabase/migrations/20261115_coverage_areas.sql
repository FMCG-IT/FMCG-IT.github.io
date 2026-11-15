begin;
create table if not exists desk_private.coverage_areas(
 name text not null check(length(name) between 1 and 100),
 normalized text generated always as (lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))) stored primary key
);
alter table desk_private.coverage_areas enable row level security;
revoke all on desk_private.coverage_areas from public,anon,authenticated;
insert into desk_private.coverage_areas(name) values
 ('FMCG'),('Rangpur Area Office'),('Khulna Area Office'),('Kushtia Area Office'),
 ('Mymensingh Area Office'),('Mymensing Pharma'),('32 Bigha Project')
on conflict do nothing;

create or replace function desk_private.valid_offices(p text[]) returns boolean
language sql stable security definer set search_path='' as $$
 select p is not null and cardinality(p)>0 and not exists(
  select 1 from unnest(p) entry(name)
  where not exists(select 1 from desk_private.coverage_areas a where a.name=entry.name)
 );
$$;

create or replace function public.desk_coverage_areas() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(name order by name),'[]'::jsonb) from desk_private.coverage_areas;
$$;
create or replace function public.desk_add_coverage_area(p_name text) returns void
language plpgsql security definer set search_path='' as $$
declare actor desk_private.officers;
 clean_name text:=btrim(regexp_replace(coalesce(p_name,''),'[[:space:]]+',' ','g'));
begin
 actor:=desk_private.member();
 if actor.manager<>1 then raise exception 'Overall IT Manager access required' using errcode='42501';end if;
 if length(clean_name) not between 1 and 100 then raise exception 'Enter an area name between 1 and 100 characters';end if;
 insert into desk_private.coverage_areas(name) values(clean_name) on conflict do nothing;
 if not found then raise exception 'This coverage area already exists';end if;
end;$$;
revoke all on function public.desk_coverage_areas(),public.desk_add_coverage_area(text) from public,anon,authenticated;
grant execute on function public.desk_coverage_areas() to anon,authenticated;
grant execute on function public.desk_add_coverage_area(text) to authenticated;
commit;
