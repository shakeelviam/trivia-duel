import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const sb = createClient(url, key)

async function main() {
  const rows: any[] = []
  // Base set
  rows.push(
    { id: randomUUID(), lang: 'en', category: 'math', difficulty: 1, stem: 'What is 2 + 2?', option0: '3', option1: '4', option2: '5', option3: '22', correct_idx: 1, published: true },
    { id: randomUUID(), lang: 'en', category: 'science', difficulty: 1, stem: 'Water chemical formula?', option0: 'CO2', option1: 'H2O', option2: 'NaCl', option3: 'O2', correct_idx: 1, published: true },
    { id: randomUUID(), lang: 'en', category: 'history', difficulty: 1, stem: 'Capital of France?', option0: 'Berlin', option1: 'Madrid', option2: 'Paris', option3: 'Rome', correct_idx: 2, published: true },
    { id: randomUUID(), lang: 'en', category: 'space', difficulty: 1, stem: 'Largest planet?', option0: 'Earth', option1: 'Jupiter', option2: 'Mars', option3: 'Venus', correct_idx: 1, published: true },
  )
  // Generate additional variations
  for (let i = 1; i <= 26; i++) {
    rows.push({
      id: randomUUID(),
      lang: 'en',
      category: i % 2 === 0 ? 'general' : 'trivia',
      difficulty: 1 + (i % 3),
      stem: `Sample question #${i}: pick the correct option`,
      option0: `Option A #${i}`,
      option1: `Option B #${i}`,
      option2: `Option C #${i}`,
      option3: `Option D #${i}`,
      correct_idx: i % 4,
      published: true,
    })
  }

  const { data, error } = await sb.from('questions').insert(rows).select('id, lang, stem')
  if (error) throw error
  console.log('Seeded questions:', data)
}

main().catch((e) => { console.error(e); process.exit(1) })
