-- Enable Row Level Security and define policies

-- Helper: is_admin(uid) checks profiles.role = 'admin'
create or replace function is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1 from profiles p where p.user_id = uid and p.role = 'admin'
  );
$$;

-- Questions: public can read only published; admins can read all
alter table questions enable row level security;
create policy if not exists questions_published_select
on questions for select
using (published = true or is_admin(auth.uid()));

-- Profiles: allow public read (handles, elo etc.). Writes via service role only
alter table profiles enable row level security;
create policy if not exists profiles_public_select
on profiles for select
using (true);

-- User question served: only the owner can read
alter table user_questions_served enable row level security;
create policy if not exists uqs_owner_select
on user_questions_served for select
using (auth.uid() = user_id or is_admin(auth.uid()));

-- Matches: user can read matches they participated in; admin can read all
alter table matches enable row level security;
create policy if not exists matches_participant_select
on matches for select
using (
  is_admin(auth.uid()) or exists (
    select 1 from match_participants mp
    where mp.match_id = matches.id and mp.user_id = auth.uid()
  )
);

-- Match participants: user can read rows for matches they are in; admin can read all
alter table match_participants enable row level security;
create policy if not exists mp_participant_select
on match_participants for select
using (
  is_admin(auth.uid()) or user_id = auth.uid() or exists (
    select 1 from match_participants mp
    where mp.match_id = match_participants.match_id and mp.user_id = auth.uid()
  )
);

-- Answers: user can read their own answers and opponent's answers for their matches; admin can read all
alter table answers enable row level security;
create policy if not exists answers_participant_select
on answers for select
using (
  is_admin(auth.uid())
  or user_id = auth.uid()
  or exists (
    select 1 from match_participants mp
    where mp.match_id = answers.match_id and mp.user_id = auth.uid()
  )
);

-- Leaderboard: public read
alter table leaderboard enable row level security;
create policy if not exists leaderboard_public_select
on leaderboard for select
using (true);

-- Note: all INSERT/UPDATE/DELETE operations are performed by the service role key from the game-service.
-- No explicit write policies are added for anon/authenticated users.
