-- Optional point scores of each game in a match, e.g. [[11, 9], [7, 11], [11, 4]]
-- (player 1's points first). The match score (games won) is stored alongside.
alter table public.matches add column game_scores jsonb;
alter table public.matches add constraint matches_game_scores_check
  check (game_scores is null or (jsonb_typeof(game_scores) = 'array' and score1 is not null));
