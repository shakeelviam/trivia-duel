import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const sb = createClient(url, key)

async function main() {
  // latest match
  const { data: match, error: mErr } = await sb
    .from('matches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (mErr) throw mErr
  if (!match) {
    console.log('No matches found')
    return
  }
  console.log('Latest match:', match)

  const matchId = match.id as string
  const { data: parts, error: pErr } = await sb
    .from('match_participants')
    .select('*')
    .eq('match_id', matchId)
    .order('user_id')
  if (pErr) throw pErr
  console.log('Participants:', parts)

  const { count, error: aErr } = await sb
    .from('answers')
    .select('*', { count: 'exact', head: true })
    .eq('match_id', matchId)
  if (aErr) throw aErr
  console.log('Answers count:', count)

  // Show ELOs for participants if any
  if (parts && parts.length) {
    const ids = parts.map((p: any) => p.user_id)
    const { data: profs, error: eErr } = await sb
      .from('profiles')
      .select('user_id, elo')
      .in('user_id', ids)
    if (eErr) throw eErr
    console.log('Profiles ELO:', profs)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
