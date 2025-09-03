-- RPC: get_next_questions
-- Returns up to p_n questions for the given lang and optional category.
-- If p_user_id is not null, also records them in user_questions_served to prevent repeats.

create or replace function public.get_next_questions(
  p_user_id uuid default null,
  p_lang lang_t,
  p_n int,
  p_category text default null
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

comment on function public.get_next_questions is 'Select up to N questions by lang/category; records served for user if user_id provided.';
