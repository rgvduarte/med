import { useEffect, useState } from 'react'

export type Route =
  | { name: 'worklist' }
  | { name: 'case'; id: string }
  | { name: 'method' }
  | { name: 'settings' }
  | { name: 'not-found' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'worklist' }
  if (parts[0] === 'caso' && parts[1]) return { name: 'case', id: decodeURIComponent(parts[1]) }
  if (parts[0] === 'metodo') return { name: 'method' }
  if (parts[0] === 'definicoes') return { name: 'settings' }
  return { name: 'not-found' }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'worklist':
      return '#/'
    case 'case':
      return `#/caso/${encodeURIComponent(route.id)}`
    case 'method':
      return '#/metodo'
    case 'settings':
      return '#/definicoes'
    default:
      return '#/'
  }
}

export function navigate(route: Route) {
  window.location.hash = href(route)
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
