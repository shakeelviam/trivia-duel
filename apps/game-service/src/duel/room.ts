import type { Socket } from 'socket.io'

export type RoomOptions = {
  totalRounds: number
  roundMs: number
}

export class DuelRoom {
  private round = 0
  private timer: NodeJS.Timeout | null = null

  constructor(
    private a: Socket,
    private b: Socket,
    private opts: RoomOptions,
  ) {}

  start() {
    this.broadcast('duel:ready')
    this.nextRound()
  }

  stop() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private broadcast(event: string, payload?: unknown) {
    this.a.emit(event, payload)
    this.b.emit(event, payload)
  }

  private nextRound() {
    this.round += 1
    if (this.round > this.opts.totalRounds) {
      this.broadcast('duel:end', { you: { score: 1 }, opponent: { score: 0 } })
      return
    }
    const endsAt = Date.now() + this.opts.roundMs
    const question = {
      id: `placeholder-q${this.round}`,
      lang: 'en',
      stem: `Round ${this.round}: 2 + 2 = ?`,
      options: ['3', '4', '5', '22'],
    }
    this.broadcast('round:start', {
      round: this.round,
      totalRounds: this.opts.totalRounds,
      question,
      endsAt,
    })

    this.timer = setTimeout(() => {
      this.broadcast('round:result', { you: true })
      this.nextRound()
    }, this.opts.roundMs)
  }
}
