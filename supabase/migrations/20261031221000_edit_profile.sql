-- Save an approved profile and queue its replacement embedding atomically.
create function public.edit_approved_profile(p_user_id uuid, p_data jsonb, p_updated_at timestamptz)
returns timestamptz language plpgsql set search_path = '' as $$
declare v_updated_at timestamptz;
begin
  update public.profiles set data = p_data, embedding = null
   where user_id = p_user_id and status = 'approved' and updated_at = p_updated_at
   returning updated_at into v_updated_at;
  if not found then return null; end if;
  insert into public.extraction_jobs (user_id, kind) values (p_user_id, 'embed');
  return v_updated_at;
end $$;
revoke execute on function public.edit_approved_profile(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.edit_approved_profile(uuid, jsonb, timestamptz) to service_role;
