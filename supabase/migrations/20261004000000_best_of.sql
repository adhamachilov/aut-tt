-- Match format per season: best of 3, 5 or 7 games. The app checks each score
-- against it (winner reaches exactly the games needed, loser has fewer).
alter table public.seasons
  add column best_of smallint not null default 5 check (best_of in (3, 5, 7));
