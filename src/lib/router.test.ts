import { describe, expect, it } from 'vitest'
import { href, parseHash } from './router'

describe('router', () => {
  it('round-trips routes', () => {
    for (const r of [{ name: 'worklist' }, { name: 'case', id: 'case-a b' }, { name: 'method' }, { name: 'settings' }] as const) {
      expect(parseHash(href(r))).toEqual(r)
    }
    expect(parseHash('#/nada')).toEqual({ name: 'not-found' })
  })
})
