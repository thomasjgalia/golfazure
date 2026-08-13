import { Link, NavLink, Outlet } from 'react-router-dom'
import { useState, ReactNode } from 'react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { User } from 'lucide-react'
import { BottomBarContext } from '@/lib/bottomBar'

// App shell: header and bottom bar are real flex siblings of the scrollable
// content area, not `position: fixed` overlays. Fixed overlays fight with
// mobile browsers' own collapsing toolbar (the classic "content hidden
// behind the bar" bug); a fixed-height flex column with an internally
// scrolling middle section sidesteps that entirely.
export default function App() {
  const { claimedPlayer, releaseProfile, isProfileClaimed } = useAuth()
  const [bottomBar, setBottomBar] = useState<ReactNode>(null)

  return (
    <div className="h-screen h-dvh flex flex-col overscroll-none">
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
