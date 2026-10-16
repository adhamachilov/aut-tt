-- How a result came about: null = played normally, 'walkover' = one player didn't show up
-- (the other wins every game 11-0), 'both_absent' = neither came (closed 0-0, no points).
alter table public.matches add column outcome text check (outcome in ('walkover', 'both_absent'));

-- A 0-0 is only allowed when both players were absent.
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.matches'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%score1 <> score2%';
  if c is not null then execute format('alter table public.matches drop constraint %I', c); end if;
end $$;

alter table public.matches add constraint matches_score_check check (
  score1 is null
  or (outcome is not distinct from 'both_absent' and score1 = 0 and score2 = 0)
  or (outcome is distinct from 'both_absent' and score1 <> score2)
);
alter table public.matches add constraint matches_outcome_needs_result check (outcome is null or score1 is not null);
