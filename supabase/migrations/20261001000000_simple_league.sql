-- Simple round-robin league: players register themselves from Telegram, join a
-- season while registration is open, the organizer starts it (schedule is
-- generated) and enters match scores. Standings are computed from matches.

create table public.players (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique check (telegram_id > 0),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  major text not null check (char_length(btrim(major)) between 2 and 60),
  year text not null check (year in ('1', '2', '3', '4', '5', 'masters', 'phd')),
  username text,
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  status text not null default 'registration' check (status in ('registration', 'active', 'finished')),
  registration_open boolean not null default true,
  registration_closes_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- Only one season can be in registration or running at a time.
create unique index seasons_one_current on public.seasons ((true)) where status <> 'finished';

create table public.season_players (
  season_id uuid not null references public.seasons (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (season_id, player_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  round integer not null check (round > 0),
  player1_id uuid not null,
  player2_id uuid not null,
  score1 smallint check (score1 between 0 and 99),
  score2 smallint check (score2 between 0 and 99),
  played_at timestamptz,
  -- Removing a player from a season removes their matches with it.
  foreign key (season_id, player1_id) references public.season_players (season_id, player_id) on delete cascade,
  foreign key (season_id, player2_id) references public.season_players (season_id, player_id) on delete cascade,
  check (player1_id <> player2_id),
  check ((score1 is null) = (score2 is null) and (score1 is null) = (played_at is null)),
  check (score1 is null or score1 <> score2)
);

create unique index matches_one_per_pair on public.matches (season_id, least(player1_id, player2_id), greatest(player1_id, player2_id));
create index matches_season on public.matches (season_id, round);
create index season_players_player on public.season_players (player_id);

-- Join while registration is open. p_force lets the organizer add someone after it closes
-- (but still before the season starts).
create function public.join_season(p_season uuid, p_player uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  is_banned boolean;
begin
  -- Shares the lock with start_season, so nobody slips in after the schedule is made.
  select * into s from public.seasons where id = p_season for share;
  if not found then raise exception 'season_not_found'; end if;
  if s.status <> 'registration' then raise exception 'registration_closed'; end if;
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

-- Players can leave only before the season starts (their matches don't exist yet).
create function public.leave_season(p_season uuid, p_player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.seasons where id = p_season and status = 'registration' for share;
  if not found then raise exception 'season_already_started'; end if;
  delete from public.season_players where season_id = p_season and player_id = p_player;
end;
$$;

-- Closes registration and stores the generated round-robin schedule in one transaction.
-- p_matches: [{ "round": 1, "player1": uuid, "player2": uuid }, ...]
create function public.start_season(p_season uuid, p_matches jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  n integer;
  inserted integer;
begin
  select * into s from public.seasons where id = p_season for update;
  if not found then raise exception 'season_not_found'; end if;
  if s.status <> 'registration' then raise exception 'season_already_started'; end if;

  select count(*) into n from public.season_players where season_id = p_season;
  if n < 2 then raise exception 'not_enough_players'; end if;

  -- Foreign keys reject non-participants; the unique index rejects repeated pairs.
  insert into public.matches (season_id, round, player1_id, player2_id)
  select p_season, (m ->> 'round')::integer, (m ->> 'player1')::uuid, (m ->> 'player2')::uuid
  from jsonb_array_elements(p_matches) m;
  get diagnostics inserted = row_count;
  if inserted <> n * (n - 1) / 2 then raise exception 'schedule_mismatch'; end if;

  update public.seasons
  set status = 'active', registration_open = false, started_at = now()
  where id = p_season;
end;
$$;

-- Everything goes through the server with the service-role key. Browsers get nothing.
alter table public.players enable row level security;
alter table public.seasons enable row level security;
alter table public.season_players enable row level security;
alter table public.matches enable row level security;

revoke all on public.players, public.seasons, public.season_players, public.matches from anon, authenticated;
grant all on public.players, public.seasons, public.season_players, public.matches to service_role;

revoke execute on function public.join_season(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.leave_season(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.start_season(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.join_season(uuid, uuid, boolean) to service_role;
grant execute on function public.leave_season(uuid, uuid) to service_role;
grant execute on function public.start_season(uuid, jsonb) to service_role;
