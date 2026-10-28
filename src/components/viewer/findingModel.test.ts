import { describe, expect, it } from 'vitest'
import { orderedRange, playableLoop } from './findingModel'

describe('cine frame ranges', () => {
  it('orders a reversed range from the model', () => {
    expect(orderedRange([5, 3])).toEqual([3, 5])
    expect(orderedRange([2, 4])).toEqual([2, 4])
  })

  it('loops only over a range of at least two frames, clamped to the clip', () => {
    expect(playableLoop([5, 3], 10)).toEqual([3, 5])
    expect(playableLoop([2, 40], 10)).toEqual([2, 9])
    expect(playableLoop([4, 4], 10)).toBeUndefined()
    expect(playableLoop([12, 15], 10)).toBeUndefined()
    expect(playableLoop([0, 3], 1)).toBeUndefined()
    expect(playableLoop(undefined, 10)).toBeUndefined()
  })
})
