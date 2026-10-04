-- Majors come from the university's program list, and there is no 5th year or PhD.
-- Bachelor's programs go with years 1-4, master's programs with 'masters'.
-- (Data was wiped before this migration, so no existing rows need converting.)

alter table public.players drop constraint players_year_check;
alter table public.players drop constraint players_major_check;

alter table public.players add constraint players_major_check check (
  (year in ('1', '2', '3', '4') and major in (
    'AI in Business', 'Business Administration', 'Business and Technology', 'Computer Science',
    'Cybersecurity', 'Data Science', 'Finance and FinTech', 'Industrial Engineering',
    'International Trade', 'International Relations & Diplomacy', 'Marketing & Communication',
    'Software Engineering', 'Tourism'
  ))
  or (year = 'masters' and major in ('AI and Business Transformation', 'Global Management', 'MBA', 'TESOL'))
);
