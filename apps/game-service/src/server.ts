import 'dotenv/config'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import type { Socket } from 'socket.io'
import { Server as IOServer } from 'socket.io'
import { loadEnv } from './config'
import { DuelRoom } from './duel/room'
import { MatchmakingQueue } from './matchmaking/queue'

const env = loadEnv()
const PORT = env.PORT
const HOST = env.HOST

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: true })
await fastify.register(rateLimit, { max: 120, timeWindow: '1 minute' })

// Health
fastify.get('/health', async () => ({ ok: true }))

// Socket.IO on the same server
const io = new IOServer(fastify.server, {
  cors: { origin: true },
})

type FindPayload = { lang: 'en' | 'ar'; topic?: string }
type AnswerPayload = { round: number; selectedIdx: number }

const queue = new MatchmakingQueue()

io.on('connection', (socket: Socket) => {
  fastify.log.info({ id: socket.id }, 'socket connected')

  socket.on('duel:find', (payload: FindPayload) => {
    const lang = payload?.lang ?? 'en'
    const topic = payload?.topic
    fastify.log.info({ id: socket.id, lang, topic }, 'duel:find')
    // enqueue and try to match
    queue.enqueue(socket, lang, topic)
    const pair = queue.tryDequeuePair(lang, topic)
    if (pair) {
      const [a, b] = pair
      fastify.log.info({ a: a.id, b: b.id, lang, topic }, 'duel:pair')
      const room = new DuelRoom(a, b, { totalRounds: 10, roundMs: 15000 })
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

  socket.on('round:answer', (payload: AnswerPayload) => {
    fastify.log.info({ id: socket.id, payload }, 'round:answer')
    // TODO: validate window + scoring server-side
    socket.emit('round:result', { you: payload.selectedIdx === 1 })
    socket.emit('duel:end', { you: { score: 1 }, opponent: { score: 0 } })
  })

  socket.on('disconnect', (reason: string) => {
    fastify.log.info({ id: socket.id, reason }, 'socket disconnected')
    queue.remove(socket)
  })
})

await fastify.listen({ port: PORT, host: HOST })
fastify.log.info(`Game service listening on http://${HOST}:${PORT}`)
