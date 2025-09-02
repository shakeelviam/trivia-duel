-- Users & profiles
create table if not exists users (
  id uuid primary key,
  created_at timestamptz default now()
);
create table if not exists profiles (
  user_id uuid primary key references users(id) on delete cascade,
  handle text unique,
  locale text,
  role text default 'user',
  elo int default 1000,
  avatar_url text,
  created_at timestamptz default now()
);

-- Questions
do $$ begin
  create type lang_t as enum ('en','ar');
exception when duplicate_object then null;
end $$;

create table if not exists questions (
  id uuid primary key,
  lang lang_t not null,
  category text,
  difficulty int default 1,
  stem text not null,
  option0 text not null,
  option1 text not null,
  option2 text not null,
  option3 text not null,
  correct_idx int not null check (correct_idx between 0 and 3),
  explanation text,
  source text,
  tags text[] default array[]::text[],
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- updated_at trigger
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_updated_at on questions;
create trigger trg_set_updated_at
before update on questions
for each row execute function set_updated_at();

-- No-repeat tracking
create table if not exists user_questions_served (
  user_id uuid not null references users(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  served_at timestamptz default now(),
  primary key(user_id, question_id)
);

-- Matches and answers
create table if not exists matches (
  id uuid primary key,
  mode text not null,
  lang lang_t not null,
  created_at timestamptz default now()
);
create table if not exists match_participants (
  match_id uuid references matches(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  score int default 0,
  primary key(match_id, user_id)
);
create table if not exists answers (
  match_id uuid references matches(id) on delete cascade,
  round int not null,
  user_id uuid not null,
  question_id uuid not null,
  selected_idx int,
  is_correct boolean,
  latency_ms int,
  primary key(match_id, round, user_id)
);

-- Leaderboard
create table if not exists leaderboard (
  period text not null,
  user_id uuid not null references users(id) on delete cascade,
  points int default 0,
  primary key(period, user_id)
);

-- Indexes
create index if not exists idx_questions_lang_published on questions (lang, published);
create index if not exists idx_uqs_user_question on user_questions_served (user_id, question_id);
create index if not exists idx_answers_match_round on answers (match_id, round);

-- RLS policies (stubs; enable RLS explicitly per table once ready)
-- alter table questions enable row level security;
-- create policy questions_published_select on questions for select using (published = true);
-- alter table user_questions_served enable row level security;
-- create policy uqs_owner_select on user_questions_served for select using (auth.uid() = user_id);
-- (Writes should be via service role only)
