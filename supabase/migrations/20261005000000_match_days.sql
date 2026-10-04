-- Matches are scheduled day by day (the organizer picks who is present and how many
-- matches each plays) instead of one fixed round robin, so players can meet again.
-- Every game of a match is played: with 3 games per match the result is 3-0, 2-1, 1-2 or 0-3.

alter table public.seasons rename column best_of to games_per_match;
alter table public.seasons alter column games_per_match set default 3;

alter table public.matches add column day smallint not null default 1 check (day > 0);
alter table public.matches add column day_date date;
alter table public.matches alter column day drop default;
update public.matches m set day_date = s.started_at::date from public.seasons s where s.id = m.season_id;

drop index public.matches_one_per_pair;
drop index public.matches_season;
create index matches_season_day on public.matches (season_id, day, round);

-- The organizer (p_force) can now also add players to a running season.
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
  if s.status = 'active' and not p_force then raise exception 'registration_closed'; end if;
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

drop function public.start_season(uuid, jsonb);

create function public.start_season(p_season uuid)
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
  update public.seasons
  set status = 'active', registration_open = false, started_at = now()
  where id = p_season;
end;
$$;

-- Adds the next match day. p_matches: [{ "round": 1, "player1": uuid, "player2": uuid }, ...]
-- where round is the order of play within the day. Returns the new day number.
create function public.add_match_day(p_season uuid, p_date date, p_matches jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  next_day integer;
begin
  select * into s from public.seasons where id = p_season for update;
  if not found then raise exception 'season_not_found'; end if;
  if s.status <> 'active' then raise exception 'season_not_active'; end if;
  if jsonb_array_length(p_matches) = 0 then raise exception 'empty_match_day'; end if;

  select coalesce(max(day), 0) + 1 into next_day from public.matches where season_id = p_season;

  -- Foreign keys reject anyone who isn't in the season.
  insert into public.matches (season_id, day, day_date, round, player1_id, player2_id)
  select p_season, next_day, p_date, (m ->> 'round')::integer, (m ->> 'player1')::uuid, (m ->> 'player2')::uuid
  from jsonb_array_elements(p_matches) m;

  return next_day;
end;
$$;

revoke execute on function public.start_season(uuid) from public, anon, authenticated;
revoke execute on function public.add_match_day(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.start_season(uuid) to service_role;
grant execute on function public.add_match_day(uuid, date, jsonb) to service_role;
