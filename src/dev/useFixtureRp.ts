import { useEffect } from 'react'
import { useCases } from '../store/cases'

let loaded = false

/** Loads the report/evidence/worklist dev fixture when the URL has ?fixture=1 (idempotent). */
export function useFixtureRp() {
  useEffect(() => {
    if (loaded || typeof location === 'undefined' || !/[?&]fixture=1(&|$)/.test(location.search)) return
    loaded = true
    import('./fixture-rp')
      .then((m) => m.buildRpFixture())
      .then((cases) => useCases.getState().upsertCases(cases))
      .catch((e) => {
        loaded = false
        console.error('Fixture rp:', e)
      })
  }, [])
}
