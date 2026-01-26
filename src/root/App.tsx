import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { User, UserX } from 'lucide-react'

export default function App() {
  const { claimedPlayer, releaseProfile, isProfileClaimed } = useAuth()

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
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
                <Button variant="outline" size="sm" onClick={releaseProfile}>
                  <UserX className="h-4 w-4 md:mr-2" />
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
      <main className="container py-6">
        <Outlet />
      </main>
    </div>
  )
}

