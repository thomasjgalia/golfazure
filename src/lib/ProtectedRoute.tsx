import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

export default function ProtectedRoute() {
  const { isProfileClaimed } = useAuth()
  const location = useLocation()

  if (!isProfileClaimed) return <Navigate to="/claim" replace state={{ from: location }} />

  return <Outlet />
}
