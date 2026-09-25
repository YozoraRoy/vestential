import test from 'node:test'
import assert from 'node:assert/strict'
import { arenaReturnPct, arenaCashEstimatePct, latestArenaSnapshot } from '../src/arena/returns.js'

// Issue #38：單一累計報酬率算法（最新快照 (equity - initial) / initial，小數 2 位）。
test('arenaReturnPct - 最新快照公式＋同一 rounding', () => {
  assert.equal(arenaReturnPct(550000, 500000), 10)
  assert.equal(arenaReturnPct(510123, 500000), 2.02)
  assert.equal(arenaReturnPct(489999, 500000), -2)
  assert.equal(arenaReturnPct(500005, 500000), 0)
})

test('arenaReturnPct - initial <= 0 或非數值回 0', () => {
  assert.equal(arenaReturnPct(100, 0), 0)
  assert.equal(arenaReturnPct(100, -5), 0)
  assert.equal(arenaReturnPct(NaN, 500000), 0)
})

test('arenaCashEstimatePct - 無快照現金公式同 rounding', () => {
  assert.equal(arenaCashEstimatePct(200000, 500000), -60)
  assert.equal(arenaCashEstimatePct(200000, 200000), 0)
})

test('latestArenaSnapshot - ASC 取最後一筆；空陣列回 null', () => {
  const snaps = [{ round_date: '2026-09-23' }, { round_date: '2026-09-24' }]
  assert.equal(latestArenaSnapshot(snaps)?.round_date, '2026-09-24')
  assert.equal(latestArenaSnapshot([]), null)
})
