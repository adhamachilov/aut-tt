-- Starting a season no longer closes registration: players can keep joining a running
-- season (they're picked for the next match days) until the organizer closes it.

create or replace function public.join_season(p_season uuid, p_player uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  is_banned boolean;
begin
  select * into s from public.seasons where id = p_season for share;
  if not found then raise exception 'season_not_found'; end if;
  if s.status = 'finished' then raise exception 'season_finished'; end if;
  if not p_force and (not s.registration_open or (s.registration_closes_at is not null and now() >= s.registration_closes_at)) then
    raise exception 'registration_closed';
  end if;

  select banned into is_banned from public.players where id = p_player;
  if is_banned is null then raise exception 'player_not_found'; end if;
  if is_banned then raise exception 'player_banned'; end if;

  insert into public.season_players (season_id, player_id) values (p_season, p_player)
  on conflict do nothing;
end;
$$;

create or replace function public.start_season(p_season uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
begin
  select * into s from public.seasons where id = p_season for update;
  if not found then raise exception 'season_not_found'; end if;
  if s.status <> 'registration' then raise exception 'season_already_started'; end if;
  if (select count(*) from public.season_players where season_id = p_season) < 2 then
    raise exception 'not_enough_players';
  end if;
  update public.seasons set status = 'active', started_at = now() where id = p_season;
end;
$$;
