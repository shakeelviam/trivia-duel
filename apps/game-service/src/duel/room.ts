import type { Socket } from 'socket.io'
import { getSupabase } from '../db/supabase'
import type { Question } from '../services/questions'

export type RoomOptions = {
  totalRounds: number
  roundMs: number
}

type Answer = { selectedIdx: number; at: number }

export class DuelRoom {
  private round = 0
  private timer: NodeJS.Timeout | null = null
  private aScore = 0
  private bScore = 0
  private aAns: Answer | null = null
  private bAns: Answer | null = null
  private roundStartAt = 0
  private roundOpen = false
  private onAnsARef: ((p: { round: number; selectedIdx: number }) => void) | null = null
  private onAnsBRef: ((p: { round: number; selectedIdx: number }) => void) | null = null
  private cleanupRef: (() => void) | null = null
  private ended = false

  constructor(
    private a: Socket,
    private b: Socket,
    private opts: RoomOptions,
    private questions: Question[],
    private persist?: { matchId: string; userA: string; userB: string } | null,
  ) {
    // Attach listeners
    this.onAnsARef = (p: { round: number; selectedIdx: number }) => this.onAnswer('a', p)
    this.onAnsBRef = (p: { round: number; selectedIdx: number }) => this.onAnswer('b', p)
    a.on('round:answer', this.onAnsARef)
    b.on('round:answer', this.onAnsBRef)
    this.cleanupRef = () => this.stop()
    a.on('disconnect', this.cleanupRef)
    b.on('disconnect', this.cleanupRef)
  }

  start() {
    this.broadcast('duel:ready')
    this.nextRound()
  }

  stop() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    // detach listeners
    if (this.onAnsARef) this.a.off('round:answer', this.onAnsARef)
    if (this.onAnsBRef) this.b.off('round:answer', this.onAnsBRef)
    if (this.cleanupRef) {
      this.a.off('disconnect', this.cleanupRef)
      this.b.off('disconnect', this.cleanupRef)
    }
    // End duel if not already
    void this.finalizeDuel()
  }

  private broadcast(event: string, payload?: unknown) {
    this.a.emit(event, payload)
    this.b.emit(event, payload)
  }

  private nextRound() {
    this.round += 1
    this.aAns = this.bAns = null
    this.roundOpen = false
    if (this.round > this.opts.totalRounds || this.round > this.questions.length) {
      void this.finalizeDuel()
      return
    }
    this.roundStartAt = Date.now()
    const endsAt = this.roundStartAt + this.opts.roundMs
    const question = this.questions[this.round - 1]
    this.broadcast('round:start', {
      round: this.round,
      totalRounds: this.opts.totalRounds,
      question,
      endsAt,
    })

    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.finishRound(), this.opts.roundMs)
    this.roundOpen = true
  }

  private onAnswer(side: 'a' | 'b', p: { round: number; selectedIdx: number }) {
    if (!this.roundOpen) return
    if (p.round !== this.round) return // stale
    const q = this.questions[this.round - 1]
    const maxIdx = q?.options?.length ?? 0
    if (typeof p.selectedIdx !== 'number' || p.selectedIdx < 0 || p.selectedIdx >= maxIdx) return
    const ans: Answer = { selectedIdx: p.selectedIdx, at: Date.now() }
    if (side === 'a') {
      if (!this.aAns) this.aAns = ans
    } else {
      if (!this.bAns) this.bAns = ans
    }
    if (this.aAns && this.bAns) this.finishRound()
  }

  private async finishRound() {
    if (!this.roundOpen) return
    this.roundOpen = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const q = this.questions[this.round - 1]
    const correctIdx = q.correctIdx
    const aCorrect = this.aAns ? this.aAns.selectedIdx === correctIdx : false
    const bCorrect = this.bAns ? this.bAns.selectedIdx === correctIdx : false
    if (aCorrect) this.aScore += 1
    if (bCorrect) this.bScore += 1

    // Persist round answers
    if (this.persist) {
      try {
        const sb = getSupabase()
        if (sb) {
          const isUuid = /^[0-9a-fA-F-]{36}$/.test(String(q.id))
          if (!isUuid) {
            // Skip persistence for placeholder questions
            throw new Error('non-uuid question id; skip answers persist')
          }
          const rows: any[] = []
          rows.push({
            match_id: this.persist.matchId,
            round: this.round,
            user_id: this.persist.userA,
            question_id: q.id,
            selected_idx: this.aAns?.selectedIdx ?? null,
            is_correct: aCorrect,
            latency_ms: this.aAns ? this.aAns.at - this.roundStartAt : null,
          })
          rows.push({
            match_id: this.persist.matchId,
            round: this.round,
            user_id: this.persist.userB,
            question_id: q.id,
            selected_idx: this.bAns?.selectedIdx ?? null,
            is_correct: bCorrect,
            latency_ms: this.bAns ? this.bAns.at - this.roundStartAt : null,
          })
          await sb.from('answers').upsert(rows)
        }
      } catch {}
    }

    // Send perspective-specific result
    this.a.emit('round:result', {
      you: { correct: aCorrect, selectedIdx: this.aAns?.selectedIdx },
      opponent: { correct: bCorrect, selectedIdx: this.bAns?.selectedIdx },
      correctIdx,
    })
    this.b.emit('round:result', {
      you: { correct: bCorrect, selectedIdx: this.bAns?.selectedIdx },
      opponent: { correct: aCorrect, selectedIdx: this.aAns?.selectedIdx },
      correctIdx,
    })

    // Next round
    setTimeout(() => this.nextRound(), 800)
  }

  private async finalizeDuel() {
    if (this.ended) return
    this.ended = true
    // Prepare payload defaults
    let eloDeltaA: number | null = null
    let eloDeltaB: number | null = null
    // Persist scores and ELO (if persistence context exists)
    if (this.persist) {
      const sb = getSupabase()
      if (sb) {
        try {
          await sb.from('match_participants').upsert([
            { match_id: this.persist.matchId, user_id: this.persist.userA, score: this.aScore },
            { match_id: this.persist.matchId, user_id: this.persist.userB, score: this.bScore },
          ])
          // ELO update
          const userA = this.persist.userA
          const userB = this.persist.userB
          const { data } = await sb
            .from('profiles')
            .select('user_id, elo')
            .in('user_id', [userA, userB])
          let eloA = 1000
          let eloB = 1000
          if (Array.isArray(data)) {
            for (const r of data) {
              if (r.user_id === userA && typeof r.elo === 'number') eloA = r.elo
              if (r.user_id === userB && typeof r.elo === 'number') eloB = r.elo
            }
          }
          const scoreA = this.aScore > this.bScore ? 1 : this.aScore === this.bScore ? 0.5 : 0
          const scoreB = 1 - scoreA
          const expA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400))
          const expB = 1 / (1 + Math.pow(10, (eloA - eloB) / 400))
          const K = 32
          const newA = Math.round(eloA + K * (scoreA - expA))
          const newB = Math.round(eloB + K * (scoreB - expB))
          eloDeltaA = newA - eloA
          eloDeltaB = newB - eloB
          await sb.from('profiles').upsert([
            { user_id: userA, elo: newA },
            { user_id: userB, elo: newB },
          ])
        } catch {}
      }
    }
    // Emit end to both sides with current scores and optional ELO delta
    this.a.emit('duel:end', { you: { score: this.aScore, eloDelta: eloDeltaA }, opponent: { score: this.bScore, eloDelta: eloDeltaB } })
    this.b.emit('duel:end', { you: { score: this.bScore, eloDelta: eloDeltaB }, opponent: { score: this.aScore, eloDelta: eloDeltaA } })
  }
}
