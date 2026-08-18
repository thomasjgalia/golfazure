import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState, ReactNode } from 'react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { User, Plus, HelpCircle } from 'lucide-react'
import { BottomBarContext } from '@/lib/bottomBar'

const CREATE_ZONE_OPTION = '__create__'

// App shell: header and bottom bar are real flex siblings of the scrollable
// content area, not `position: fixed` overlays. Fixed overlays fight with
// mobile browsers' own collapsing toolbar (the classic "content hidden
// behind the bar" bug); a fixed-height flex column with an internally
// scrolling middle section sidesteps that entirely.
export default function App() {
  const { claimedPlayer, releaseProfile, isProfileClaimed, zones, currentZoneId, setCurrentZone } = useAuth()
  const [bottomBar, setBottomBar] = useState<ReactNode>(null)
  const nav = useNavigate()

  // iOS Safari (and, less often, Android Chrome) can leave `100dvh` stuck at
  // whatever the browser toolbar's height was on first paint, not updating
  // as the toolbar collapses/expands during scroll - a pinch-zoom forces a
  // layout recompute and "fixes" it, which is the tell. Track the real
  // visible height ourselves via visualViewport and drive layout off that,
  // falling back to 100dvh only until JS has run once.
  useEffect(() => {
    const vv = window.visualViewport
    function setAppHeight() {
      const h = vv?.height ?? window.innerHeight
      document.documentElement.style.setProperty('--app-height', `${h}px`)
    }
    setAppHeight()
    vv?.addEventListener('resize', setAppHeight)
    vv?.addEventListener('scroll', setAppHeight)
    window.addEventListener('resize', setAppHeight)
    return () => {
      vv?.removeEventListener('resize', setAppHeight)
      vv?.removeEventListener('scroll', setAppHeight)
      window.removeEventListener('resize', setAppHeight)
    }
  }, [])

  function onZonePick(value: string) {
    if (value === CREATE_ZONE_OPTION) {
      nav('/zones/create')
      return
    }
    setCurrentZone(Number(value))
  }

  return (
    <div className="flex flex-col overscroll-none" style={{ height: 'var(--app-height, 100dvh)' }}>
      <header className="shrink-0 border-b bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="container flex h-14 items-center justify-between gap-4">
          <Link to="/" className="font-semibold">
            SOL Golf
          </Link>
          <nav className="flex gap-4 text-sm items-center">
            <NavLink to="/events" className={({ isActive }) => isActive ? 'text-primary font-medium' : 'text-muted-foreground'}>Events</NavLink>
            <NavLink to="/players" className={({ isActive }) => isActive ? 'text-primary font-medium' : 'text-muted-foreground'}>Players</NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0">
              <Link to="/help" aria-label="Help"><HelpCircle className="h-4 w-4" /></Link>
            </Button>
            {/* A player in exactly one zone never needs to think about zones -
                the switcher only shows up once there's an actual choice to make. */}
            {isProfileClaimed && zones.length > 1 && (
              <Select value={currentZoneId != null ? String(currentZoneId) : undefined} onValueChange={onZonePick}>
                <SelectTrigger className="h-8 w-20 sm:w-auto max-w-[7rem] text-xs">
                  <SelectValue placeholder="Zone" />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((z) => (
                    <SelectItem key={z.zoneid} value={String(z.zoneid)}>{z.name}</SelectItem>
                  ))}
                  <SelectItem value={CREATE_ZONE_OPTION}>+ Create new zone</SelectItem>
                </SelectContent>
              </Select>
            )}
            {isProfileClaimed && zones.length <= 1 && (
              <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground px-2">
                <Link to="/zones/create" aria-label="Create new zone">
                  <Plus className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">New Zone</span>
                </Link>
              </Button>
            )}
            {isProfileClaimed ? (
              <>
                <div className="text-xs text-muted-foreground hidden md:flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {claimedPlayer?.firstname} {claimedPlayer?.lastname}
                </div>
                <Button variant="success" size="sm" onClick={releaseProfile}>
                  <User className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Release</span>
                </Button>
              </>
            ) : (
              <Link to="/claim">
                <Button variant="outline" size="sm">
                  <User className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Claim Profile</span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="container py-6">
          <BottomBarContext.Provider value={setBottomBar}>
            <Outlet />
          </BottomBarContext.Provider>
        </div>
      </main>

      {bottomBar && (
        <footer
          className="shrink-0 border-t bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="container py-2">{bottomBar}</div>
        </footer>
      )}
    </div>
  )
}
