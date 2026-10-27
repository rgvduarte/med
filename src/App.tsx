import { useEffect } from 'react'
import { Shell } from './components/Shell'
import { useRoute } from './lib/router'
import { Worklist } from './pages/Worklist'
import { CaseWorkspace } from './pages/CaseWorkspace'
import { Method } from './pages/Method'
import { Settings } from './pages/Settings'
import { loadDemoCases } from './data/demoCases'
import { useCases } from './store/cases'

export default function App() {
  const route = useRoute()
  const upsertCases = useCases((s) => s.upsertCases)

  useEffect(() => {
    loadDemoCases()
      .then(upsertCases)
      .catch(() => undefined)
  }, [upsertCases])
  useEffect(() => void (window.location.search.includes('fixture=1') && import('./dev/fixture-ws').then((m) => m.loadWsFixture())), [])

  useEffect(() => {
    document.querySelector('.main')?.scrollTo(0, 0)
  }, [route])

  return (
    <Shell route={route}>
      {route.name === 'worklist' && <Worklist />}
      {route.name === 'case' && <CaseWorkspace id={route.id} />}
      {route.name === 'method' && <Method />}
      {route.name === 'settings' && <Settings />}
      {route.name === 'not-found' && <Worklist />}
    </Shell>
  )
}
