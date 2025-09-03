import { io, Socket } from 'socket.io-client'

const HOST = process.env.HOST || '127.0.0.1'
const PORT = process.env.PORT || '3001'
const URL = `http://${HOST}:${PORT}`

const USER_A = process.env.SIM_USER_A // optional UUID for persistence
const USER_B = process.env.SIM_USER_B // optional UUID for persistence
const LANG = (process.env.SIM_LANG as 'en' | 'ar') || 'en'
const TOPIC = process.env.SIM_TOPIC // optional

function mkClient(name: string, userId?: string) {
  const s = io(URL, { transports: ['websocket'] })
  let currentRound = 0

  const log = (...args: any[]) => console.log(`[${name}]`, ...args)

  s.on('connect', () => {
    log('connected', s.id)
    s.emit('duel:find', { lang: LANG, topic: TOPIC, userId })
  })

  s.on('error', (e: any) => log('error', e))
  s.on('disconnect', (reason: string) => log('disconnect', reason))

  s.on('duel:ready', () => log('duel:ready'))

  s.on('round:start', (p: any) => {
    currentRound = p.round
    const endsIn = Math.max(0, p.endsAt - Date.now())
    const delay = Math.min(endsIn - 50, Math.floor(200 + Math.random() * 1200))
    const optionsCount = Array.isArray(p.question?.options) ? p.question.options.length : 4
    const selectedIdx = Math.floor(Math.random() * optionsCount)
    log(`round:start r=${p.round}/${p.totalRounds} endsIn=${endsIn}ms answer@${delay}ms idx=${selectedIdx}`)
    setTimeout(() => {
      s.emit('round:answer', { round: currentRound, selectedIdx })
    }, Math.max(0, isFinite(delay) ? delay : 250))
  })

  s.on('round:result', (p: any) => {
    log(`round:result you.correct=${p.you.correct} you.sel=${p.you.selectedIdx} correctIdx=${p.correctIdx}`)
  })

  s.on('duel:end', (p: any) => {
    log(`duel:end yourScore=${p.you.score} opponent=${p.opponent.score}`)
  })

  return s
}

async function main() {
  console.log(`Simulator connecting to ${URL} lang=${LANG} topic=${TOPIC ?? '-'} A=${USER_A ?? '-'} B=${USER_B ?? '-'}`)
  const a = mkClient('A', USER_A)
  const b = mkClient('B', USER_B)

  let endedA = false
  let endedB = false

  a.on('duel:end', () => {
    endedA = true
    if (endedB) finish()
  })
  b.on('duel:end', () => {
    endedB = true
    if (endedA) finish()
  })

  const timeout = setTimeout(() => {
    console.warn('Timeout reached, closing...')
    finish()
  }, Number(process.env.SIM_TIMEOUT_MS || 60_000))

  function finish() {
    clearTimeout(timeout)
    a.disconnect()
    b.disconnect()
    // Give a tick for disconnects to flush
    setTimeout(() => process.exit(0), 250)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
