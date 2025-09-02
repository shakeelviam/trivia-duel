import type { Socket } from 'socket.io'

export type MatchKey = string

function keyOf(lang: 'en' | 'ar', topic?: string): MatchKey {
  return `${lang}:${topic ?? 'any'}`
}

export class MatchmakingQueue {
  private queues = new Map<MatchKey, Socket[]>()

  enqueue(socket: Socket, lang: 'en' | 'ar', topic?: string) {
    const key = keyOf(lang, topic)
    const q = this.queues.get(key) ?? []
    q.push(socket)
    this.queues.set(key, q)
  }

  remove(socket: Socket) {
    for (const [key, q] of this.queues.entries()) {
      const idx = q.findIndex((s) => s.id === socket.id)
      if (idx >= 0) {
        q.splice(idx, 1)
        if (q.length === 0) this.queues.delete(key)
        else this.queues.set(key, q)
        return true
      }
    }
    return false
  }

  tryDequeuePair(lang: 'en' | 'ar', topic?: string): [Socket, Socket] | null {
    const key = keyOf(lang, topic)
    const q = this.queues.get(key)
    if (!q || q.length < 2) return null
    const a = q.shift()
    const b = q.shift()
    if (!a || !b) return null
    if (q.length === 0) this.queues.delete(key)
    else this.queues.set(key, q)
    return [a, b]
  }
}
