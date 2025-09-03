import type { SupabaseClient } from '@supabase/supabase-js'

export type Lang = 'en' | 'ar'

export type QuestionRow = {
  id: string
  lang: Lang
  category: string | null
  difficulty: number
  stem: string
  option0: string
  option1: string
  option2: string
  option3: string
  correct_idx: number
}

export type Question = {
  id: string
  lang: Lang
  stem: string
  options: string[]
  correctIdx: number
}

export async function getNextQuestions(
  sb: SupabaseClient,
  {
    userId,
    lang,
    n,
    category,
  }: { userId?: string | null; lang: Lang; n: number; category?: string | null },
): Promise<Question[]> {
  const { data, error } = await sb.rpc('get_next_questions', {
    p_user_id: userId ?? null,
    p_lang: lang,
    p_n: n,
    p_category: category ?? null,
  })

  if (error) throw error

  const rows = (data as QuestionRow[]) ?? []
  return rows.map((r) => ({
    id: r.id,
    lang: r.lang,
    stem: r.stem,
    options: [r.option0, r.option1, r.option2, r.option3],
    correctIdx: r.correct_idx,
  }))
}
