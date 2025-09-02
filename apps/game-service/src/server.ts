import 'dotenv/config'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import type { Socket } from 'socket.io'
import { Server as IOServer } from 'socket.io'

const PORT = Number(process.env.PORT || 3001)
const HOST = process.env.HOST || '0.0.0.0'

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

io.on('connection', (socket: Socket) => {
  fastify.log.info({ id: socket.id }, 'socket connected')

  socket.on('duel:find', (payload: FindPayload) => {
    fastify.log.info({ id: socket.id, payload }, 'duel:find')
    // TODO: enqueue matchmaking by lang/topic
    socket.emit('duel:ready')
    // For now, immediately start round 1 placeholder
    socket.emit('round:start', {
      round: 1,
      totalRounds: 10,
      question: {
        id: 'placeholder-q1',
        lang: payload?.lang ?? 'en',
        stem: 'Placeholder question: 2 + 2 = ?',
        options: ['3', '4', '5', '22'],
      },
      endsAt: Date.now() + 15000,
    })
  })

  socket.on('duel:leave', () => {
    fastify.log.info({ id: socket.id }, 'duel:leave')
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
  })
})

await fastify.listen({ port: PORT, host: HOST })
fastify.log.info(`Game service listening on http://${HOST}:${PORT}`)
