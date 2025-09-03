-- Fix function parameter order and create RLS policies without IF NOT EXISTS

-- 1) Function: move defaulted param to the end to satisfy Postgres rule
create or replace function public.get_next_questions(
  p_lang lang_t,
  p_n int,
  p_category text default null,
  p_user_id uuid default null
)
returns setof questions
language plpgsql
security definer
as $$
declare

begin
  return query with cand as (
    select q.*
    from questions q
    where q.published is true
      and q.lang = p_lang
      and (p_category is null or q.category = p_category)
      and (
        p_user_id is null
        or not exists (
          select 1 from user_questions_served uqs
          where uqs.user_id = p_user_id and uqs.question_id = q.id
        )
      )
    order by random()
    limit p_n
  ), ins as (
    insert into user_questions_served(user_id, question_id)
    select p_user_id, c.id from cand c
    where p_user_id is not null
    on conflict do nothing
    returning question_id
  )
  select * from cand;
end;
$$;

comment on function public.get_next_questions(lang_t, int, text, uuid)
is 'Select up to N questions by lang/category; records served for user if user_id provided.';

-- 2) RLS policies: use DO blocks to avoid CREATE POLICY IF NOT EXISTS (unsupported)

-- Helper function should already exist, but redefine idempotently
create or replace function is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1 from profiles p where p.user_id = uid and p.role = 'admin'
  );
$$;

-- Ensure RLS enabled (idempotent)
alter table if exists questions enable row level security;
alter table if exists profiles enable row level security;
alter table if exists user_questions_served enable row level security;
alter table if exists matches enable row level security;
alter table if exists match_participants enable row level security;
alter table if exists answers enable row level security;
alter table if exists leaderboard enable row level security;

-- questions_published_select
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'questions' and policyname = 'questions_published_select'
  ) then
    create policy questions_published_select on questions for select
    using (published = true or is_admin(auth.uid()));
  end if;
end $$;

-- profiles_public_select
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_public_select'
  ) then
    create policy profiles_public_select on profiles for select using (true);
  end if;
end $$;

-- uqs_owner_select
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_questions_served' and policyname = 'uqs_owner_select'
  ) then
    create policy uqs_owner_select on user_questions_served for select
    using (auth.uid() = user_id or is_admin(auth.uid()));
  end if;
end $$;

-- matches_participant_select
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'matches' and policyname = 'matches_participant_select'
  ) then
    create policy matches_participant_select on matches for select
    using (
      is_admin(auth.uid()) or exists (
        select 1 from match_participants mp where mp.match_id = matches.id and mp.user_id = auth.uid()
      )
    );
  end if;
end $$;

-- mp_participant_select
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'match_participants' and policyname = 'mp_participant_select'
  ) then
    create policy mp_participant_select on match_participants for select
    using (
      is_admin(auth.uid()) or user_id = auth.uid() or exists (
        select 1 from match_participants mp where mp.match_id = match_participants.match_id and mp.user_id = auth.uid()
      )
    );
  end if;
end $$;

-- answers_participant_select
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'answers' and policyname = 'answers_participant_select'
  ) then
    create policy answers_participant_select on answers for select
    using (
      is_admin(auth.uid())
      or user_id = auth.uid()
      or exists (
        select 1 from match_participants mp where mp.match_id = answers.match_id and mp.user_id = auth.uid()
      )
    );
  end if;
end $$;

-- leaderboard_public_select
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'leaderboard' and policyname = 'leaderboard_public_select'
  ) then
    create policy leaderboard_public_select on leaderboard for select using (true);
  end if;
end $$;
