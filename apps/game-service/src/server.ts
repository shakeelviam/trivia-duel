import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import type { Socket } from 'socket.io'
import { Server as IOServer } from 'socket.io'
import { loadEnv } from './config'
import { DuelRoom } from './duel/room'
import { z } from 'zod'
import { MatchmakingQueue } from './matchmaking/queue'
import { getSupabase } from './db/supabase'
import { getNextQuestions, type Lang } from './services/questions'

const env = loadEnv()
const PORT = env.PORT
const HOST = env.HOST

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: true })
await fastify.register(rateLimit, { max: 120, timeWindow: '1 minute' })

// Health
fastify.get('/health', async () => ({ ok: true }))

// Convenience redirect so hitting root shows the test UI
fastify.get('/', async (req, reply) => reply.redirect('/test'))

fastify.get('/test', async (req, reply) => {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Trivia Duel · Test UI</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      :root {
        --bg: #0b1020;
        --card: #121938;
        --muted: #a4b0ff;
        --text: #e8ecff;
        --accent: #7c9bff;
        --accent-2: #00d0ff;
        --success: #2ecc71;
        --danger: #ff5d73;
        --warning: #ffd166;
      }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, ui-sans-serif, system-ui; color: var(--text); background:
        radial-gradient(1200px 600px at 10% -10%, #21306a 0%, rgba(0,0,0,0) 60%),
        radial-gradient(900px 500px at 100% 10%, #0c5a66 0%, rgba(0,0,0,0) 55%),
        var(--bg);
      }
      header { display:flex; align-items:center; justify-content:space-between; padding: 20px 24px; }
      .title { font-weight: 700; letter-spacing: 0.3px; font-size: 20px; }
      .badge { background: linear-gradient(120deg, var(--accent), var(--accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; font-weight: 700; }
      .container { max-width: 980px; margin: 0 auto; padding: 16px; }
      .grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; }
      @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
      .card { background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; box-shadow: 0 12px 40px rgba(12, 18, 64, 0.4); overflow: hidden; }
      .section { padding: 18px 18px; }
      .controls { display:flex; align-items:center; gap: 10px; flex-wrap: wrap; }
      select, input { background:#0c1534; border:1px solid rgba(255,255,255,0.12); color:var(--text); padding:10px 12px; border-radius:10px; outline:none; }
      input::placeholder{ color:#94a3b8; }
      button { border: none; background: linear-gradient(120deg, var(--accent), var(--accent-2)); color: #051122; font-weight: 700; padding: 10px 14px; border-radius: 10px; cursor: pointer; box-shadow: 0 6px 18px rgba(22, 126, 248, 0.35); transition: transform .06s ease; }
      button.ghost { background: transparent; color: var(--text); border: 1px solid rgba(255,255,255,0.14); box-shadow: none; }
      button:active { transform: translateY(1px); }

      .question { padding: 12px 16px; font-size: 18px; font-weight: 600; letter-spacing: .2px; }
      .timer { height: 8px; background: rgba(255,255,255,0.08); margin: 0 16px 12px; border-radius: 999px; overflow:hidden; }
      .timer > div { height: 100%; width: 0; background: linear-gradient(90deg, var(--warning), var(--danger)); transition: width .2s linear; }
      .options { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 16px 16px; }
      .opt { background: #0d1430; border: 1px solid rgba(255,255,255,0.12); color: var(--text); padding: 14px 12px; border-radius: 12px; cursor: pointer; text-align:left; font-weight: 600; letter-spacing: .2px; transition: transform .08s ease, border-color .2s ease; }
      .opt:hover { transform: translateY(-1px); border-color: var(--accent-2); }
      .opt.correct { border-color: var(--success); box-shadow: 0 0 0 2px rgba(46,204,113,.25) inset; }
      .opt.wrong { border-color: var(--danger); box-shadow: 0 0 0 2px rgba(255,93,115,.25) inset; }

      .players { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 16px; }
      .player { background:#0c1534; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px; }
      .player h4 { margin: 0 0 6px; font-size: 14px; color: var(--muted); font-weight: 600; }
      .stat { font-size: 22px; font-weight: 800; }
      .status { padding: 8px 12px; color: #cbd5e1; display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .chip { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px; font-size:12px; border:1px solid rgba(255,255,255,0.12); background:#0c1534; }
      .chip.dot::before{ content:''; width:8px; height:8px; border-radius:999px; background:#10b981; display:inline-block; }
      .muted { color: #9aa6ff; font-weight: 600; }
      #log { height: 200px; overflow: auto; background: #0a0f24; color: #9ee6ff; padding: 10px 12px; white-space: pre-wrap; border-top: 1px solid rgba(255,255,255,0.08); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
      .avatar { width:36px; height:36px; border-radius:999px; background:#0c1534; border:1px solid rgba(255,255,255,0.08); }
      .row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      /* End overlay */
      #endOverlay { position: fixed; inset: 0; background: rgba(6,10,24,0.7); display:none; align-items:center; justify-content:center; padding: 24px; }
      .endCard { width: 640px; max-width: 96vw; background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)); border:1px solid rgba(255,255,255,0.12); border-radius:16px; box-shadow: 0 20px 60px rgba(8,12,32,.6); overflow:hidden; }
      .endHead { padding: 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .banner { font-size:22px; font-weight:900; letter-spacing:.3px; }
      .stats { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 18px 18px; }
      .statBox { background:#0c1534; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px; }
      .cta { padding: 0 18px 18px; display:flex; gap:10px; }
    </style>
    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
  </head>
  <body>
    <header>
      <div class="title">Trivia <span class="badge">Duel</span></div>
      <div class="controls">
        <select id="lang"><option value="en">English</option><option value="ar">Arabic</option></select>
        <input id="topic" placeholder="Category (optional)"/>
        <input id="userId" placeholder="User UUID (optional)"/>
        <button id="connect">Connect</button>
        <button id="find">Find Match</button>
        <button id="leave" class="ghost">Leave</button>
      </div>
    </header>
    <div class="container">
      <div class="grid">
        <div class="card">
          <div class="section status"><span id="status" class="muted">Idle</span><span id="ping" class="chip dot">-- ms</span></div>
          <div class="question" id="q">Waiting for match…</div>
          <div class="timer"><div id="bar"></div></div>
          <div class="options" id="opts"></div>
          <div id="result" class="section"></div>
        </div>
        <div class="card">
          <div class="players">
            <div class="player">
              <div class="row"><h4>You</h4><img id="youAva" class="avatar"/></div>
              <div class="stat" id="youScore">0</div>
            </div>
            <div class="player">
              <div class="row"><h4>Opponent</h4><img id="oppAva" class="avatar"/></div>
              <div class="stat" id="oppScore">0</div>
            </div>
          </div>
          <div class="section"><button id="rematch" class="ghost">Rematch</button></div>
          <div id="log"></div>
        </div>
      </div>
    </div>
    <div id="endOverlay">
      <div class="endCard">
        <div class="endHead">
          <div class="banner" id="banner">Duel Ended</div>
          <div class="chip" id="roundsRecap">0 / 0 rounds</div>
        </div>
        <div class="stats">
          <div class="statBox"><div class="muted">Your score</div><div class="stat" id="endYour">0</div></div>
          <div class="statBox"><div class="muted">Opponent</div><div class="stat" id="endOpp">0</div></div>
          <div class="statBox"><div class="muted">Accuracy</div><div class="stat" id="endAcc">0%</div></div>
          <div class="statBox"><div class="muted">Avg latency</div><div class="stat" id="endLat">-- ms</div></div>
          <div class="statBox"><div class="muted">ELO change</div><div class="stat" id="endElo">--</div></div>
        </div>
        <div class="cta">
          <button id="playAgain">Rematch</button>
          <button id="newMatch" class="ghost">New Match</button>
        </div>
      </div>
    </div>
    <script>
      const $ = (id) => document.getElementById(id)
      const log = (msg, obj) => {
        const line = typeof obj !== 'undefined' ? msg + ' ' + JSON.stringify(obj) : msg
        const el = document.createElement('div'); el.textContent = line; $('log').appendChild(el); $('log').scrollTop = $('log').scrollHeight
      }
      let client = null
      let currentRound = 0
      let totalRounds = 0
      let timerInt = null
      let lastFind = null
      let roundStartAt = 0
      let answeredThisRound = false
      let correctCount = 0
      let totalAnswered = 0
      let totalLatency = 0
      const setAvatar = (el, seed) => {
        if (!seed) { el.src = 'https://api.dicebear.com/7.x/shapes/svg?seed=anon' ; return }
        el.src = 'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(seed)
      }
      const startBar = (ms) => {
        clearInterval(timerInt)
        const bar = $('bar'); bar.style.width = '100%'
        const start = Date.now();
        timerInt = setInterval(() => {
          const t = Date.now() - start
          const left = Math.max(0, 1 - (t / ms))
          bar.style.width = (left * 100).toFixed(2) + '%'
          if (left <= 0) clearInterval(timerInt)
        }, 100)
      }

      const renderOptions = (opts, lock = false) => {
        const wrap = $('opts');
        wrap.innerHTML = ''
        opts.forEach((text, idx) => {
          const b = document.createElement('button'); b.className = 'opt'; b.textContent = text
          b.disabled = !!lock
          b.onclick = () => {
            document.querySelectorAll('.opt').forEach(x => x.disabled = true)
            if (!answeredThisRound) {
              answeredThisRound = true
              const lat = Math.max(0, Date.now() - roundStartAt)
              totalLatency += lat
              totalAnswered += 1
              client.emit('round:answer', { round: currentRound, selectedIdx: idx })
            }
          }
          wrap.appendChild(b)
        })
      }

      $('connect').onclick = () => {
        if (client) { log('already connected'); return }
        client = io('/', { transports: ['websocket'] })
        client.on('connect', () => { log('connected ' + client.id); $('status').textContent = 'Connected'; startPing() })
        client.on('duel:queued', () => { log('queued'); $('status').textContent = 'Queued…' })
        client.on('duel:ready', () => { log('ready'); $('status').textContent = 'Matched! Get ready…' })
        client.on('round:start', (p) => {
          currentRound = p.round; totalRounds = p.totalRounds
          $('status').textContent = 'Round ' + p.round + ' / ' + p.totalRounds
          $('q').textContent = p.question?.stem || ''
          $('result').textContent = ''
          startBar((p.endsAt || 0) - Date.now())
          renderOptions(p.question?.options || [])
          log('round:start', { round: p.round, stem: p.question?.stem })
          // reset per-round trackers
          roundStartAt = Date.now()
          answeredThisRound = false
          // If this is the first round of a new match, reset aggregate stats and hide overlay
          if (p.round === 1) {
            correctCount = 0
            totalAnswered = 0
            totalLatency = 0
            const ov = document.getElementById('endOverlay'); if (ov) ov.style.display = 'none'
          }
        })
        client.on('round:result', (p) => {
          clearInterval(timerInt)
          const you = p.you?.correct === true
          const opp = p.opponent?.correct === true
          $('youScore').textContent = (parseInt($('youScore').textContent) + (you ? 1 : 0)).toString()
          $('oppScore').textContent = (parseInt($('oppScore').textContent) + (opp ? 1 : 0)).toString()
          const options = document.querySelectorAll('.opt')
          if (options.length) {
            options.forEach((el, i) => {
              el.classList.toggle('correct', i === p.correctIdx)
              if (i === p.you?.selectedIdx && !you) el.classList.add('wrong')
            })
          }
          $('result').textContent = you ? 'Correct!' : 'Wrong!'
          if (you) correctCount += 1
          log('round:result', p)
        })
        client.on('duel:end', (p) => {
          $('status').textContent = 'Duel Ended'
          log('duel:end', p)
          // Show end overlay with stats
          const your = p?.you?.score ?? 0
          const opp = p?.opponent?.score ?? 0
          $('endYour').textContent = your
          $('endOpp').textContent = opp
          $('roundsRecap').textContent = (Math.min(totalAnswered, totalRounds)) + ' / ' + totalRounds + ' rounds'
          const acc = totalAnswered ? Math.round((correctCount / totalAnswered) * 100) : 0
          $('endAcc').textContent = acc + '%'
          const avg = totalAnswered ? Math.round(totalLatency / totalAnswered) : 0
          $('endLat').textContent = avg + ' ms'
          const eloDelta = (p && p.you && typeof p.you.eloDelta === 'number') ? p.you.eloDelta : null
          $('endElo').textContent = eloDelta === null ? '--' : (eloDelta >= 0 ? '+' + eloDelta : '' + eloDelta)
          $('banner').textContent = your === opp ? 'Draw' : your > opp ? 'You Win! 🎉' : 'You Lose'
          document.getElementById('endOverlay').style.display = 'flex'
        })
        client.on('connect_error', (e) => log('connect_error ' + e))
      }

      $('find').onclick = () => {
        if (!client) return alert('Connect first')
        const lang = /** @type {HTMLSelectElement} */($('lang')).value
        const topic = /** @type {HTMLInputElement} */($('topic')).value || undefined
        const userId = /** @type {HTMLInputElement} */($('userId')).value || undefined
        lastFind = { lang, topic, userId }
        setAvatar($('youAva'), userId || 'you')
        setAvatar($('oppAva'), 'opponent')
        $('youScore').textContent = '0'; $('oppScore').textContent = '0'
        client.emit('duel:find', { lang, topic, userId })
        log('duel:find sent', { lang, topic, userId })
      }

      $('leave').onclick = () => {
        if (!client) return
        client.emit('duel:leave')
        client.close(); client = null
        $('status').textContent = 'Disconnected'
        log('left + disconnected')
      }

      $('rematch').onclick = () => {
        if (!client) return alert('Connect first')
        if (!lastFind) return alert('Find a match first')
        $('youScore').textContent = '0'; $('oppScore').textContent = '0'
        client.emit('duel:find', lastFind)
        log('rematch sent', lastFind)
      }

      $('playAgain').onclick = () => {
        document.getElementById('endOverlay').style.display = 'none'
        $('rematch').click()
        // reset stats
        correctCount = 0; totalAnswered = 0; totalLatency = 0
      }
      $('newMatch').onclick = () => {
        document.getElementById('endOverlay').style.display = 'none'
        $('youScore').textContent = '0'; $('oppScore').textContent = '0'
        // keep connected; user can choose new settings and click Find
      }

      // ping indicator
      let pingTimer = null
      const startPing = () => {
        clearInterval(pingTimer)
        pingTimer = setInterval(() => {
          if (!client) return
          const t = Date.now()
          client.emit('ui:ping', t)
        }, 3000)
      }
      if (!window.__pongBound) {
        window.__pongBound = true
        const onPong = (t) => {
          const rtt = Math.max(0, Date.now() - (t || Date.now()))
          const chip = $('ping'); chip.textContent = rtt + ' ms'
          chip.style.borderColor = 'rgba(255,255,255,0.14)'
          chip.style.background = rtt < 80 ? '#0b1f2f' : rtt < 160 ? '#2a1f0b' : '#2f0b16'
        }
        setInterval(() => { if (client) client.on('ui:pong', onPong) }, 1000)
      }
    </script>
  </body>
</html>`
  return reply.header('content-type', 'text/html').send(html)
})

// Socket.IO on the same server
const io = new IOServer(fastify.server, {
  cors: { origin: true },
})

type FindPayload = { lang: Lang; topic?: string; userId?: string }
const FindSchema = z.object({
  lang: z.union([z.literal('en'), z.literal('ar')]).default('en'),
  topic: z.string().trim().min(1).max(64).optional(),
  userId: z.string().uuid().optional(),
})
type AnswerPayload = { round: number; selectedIdx: number }

const queue = new MatchmakingQueue()

io.on('connection', (socket: Socket) => {
  fastify.log.info({ id: socket.id }, 'socket connected')
  ;(socket.data as any) = { ...(socket.data || {}), lastFindAt: 0 }

  socket.on('duel:find', async (payload: FindPayload) => {
    const parsed = FindSchema.safeParse(payload ?? {})
    if (!parsed.success) {
      fastify.log.warn({ id: socket.id, issues: parsed.error.issues }, 'invalid duel:find')
      socket.emit('error', { code: 'bad_request', message: 'Invalid find payload' })
      return
    }
    const now = Date.now()
    const lastFindAt = (socket.data as any)?.lastFindAt ?? 0
    if (now - lastFindAt < 1000) {
      fastify.log.warn({ id: socket.id }, 'duel:find throttled')
      return
    }
    ;(socket.data as any).lastFindAt = now
    const { lang, topic, userId } = parsed.data
    fastify.log.info({ id: socket.id, lang, topic, userId }, 'duel:find')
    // keep userId on the socket for persistence
    ;(socket.data as any) = { ...(socket.data || {}), userId, lang, topic }
    // enqueue and try to match
    queue.enqueue(socket, lang, topic)
    const pair = queue.tryDequeuePair(lang, topic)
    if (pair) {
      const [a, b] = pair
      fastify.log.info({ a: a.id, b: b.id, lang, topic }, 'duel:pair')
      const totalRounds = 10
      const roundMs = 15000
      // Fetch questions via Supabase RPC with graceful fallback
      let questions: Array<{
        id: string
        lang: Lang
        stem: string
        options: string[]
        correctIdx: number
      }>
      try {
        const sb = getSupabase()
        if (sb) {
          questions = await getNextQuestions(sb, {
            userId,
            lang,
            n: totalRounds,
            category: topic ?? null,
          })
        } else {
          throw new Error('Supabase not configured')
        }
      } catch (err) {
        fastify.log.warn({ err }, 'question fetch failed; using placeholders')
        questions = Array.from({ length: totalRounds }).map((_, i) => ({
          id: `placeholder-q${i + 1}`,
          lang,
          stem: `Round ${i + 1}: 2 + 2 = ?`,
          options: ['3', '4', '5', '22'],
          correctIdx: 1,
        }))
      }

      // Optional persistence if both players provided userId
      let persist: { matchId: string; userA: string; userB: string } | null = null
      try {
        const userA = (a.data as any)?.userId as string | undefined
        const userB = (b.data as any)?.userId as string | undefined
        if (userA && userB) {
          const sb = getSupabase()
          if (sb) {
            const matchId = randomUUID()
            // Ensure users exist
            await sb.from('users').upsert([{ id: userA }, { id: userB }])
            await sb.from('matches').insert({ id: matchId, mode: 'duel', lang })
            await sb.from('match_participants').insert([
              { match_id: matchId, user_id: userA, score: 0 },
              { match_id: matchId, user_id: userB, score: 0 },
            ])
            persist = { matchId, userA, userB }
            fastify.log.info({ matchId }, 'match persisted')
          }
        }
      } catch (err) {
        fastify.log.warn({ err }, 'failed to persist match')
      }

      const room = new DuelRoom(a, b, { totalRounds, roundMs }, questions, persist)
      room.start()
    } else {
      socket.emit('duel:queued')
    }
  })

  socket.on('duel:leave', () => {
    fastify.log.info({ id: socket.id }, 'duel:leave')
    queue.remove(socket)
    socket.disconnect(true)
  })

  // round:answer is handled inside DuelRoom, which listens directly on sockets
  socket.on('ui:ping', (t: number) => {
    socket.emit('ui:pong', t)
  })

  socket.on('disconnect', (reason: string) => {
    fastify.log.info({ id: socket.id, reason }, 'socket disconnected')
    queue.remove(socket)
  })
})

await fastify.listen({ port: PORT, host: HOST })
fastify.log.info(`Game service listening on http://${HOST}:${PORT}`)
