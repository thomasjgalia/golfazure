import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { Toaster } from 'sonner'
import App from './root/App'
import EventsListPage from './pages/EventsListPage'
import EventDetailsPage from './pages/EventDetailsPage'
import PlayersPage from './pages/PlayersPage'
import TeamsPage from './pages/TeamsPage'
import ScoringPage from './pages/ScoringPage'
import LeaderboardPage from './pages/LeaderboardPage'
import PublicScoringPage from './pages/PublicScoringPage'
import ProtectedRoute from './lib/ProtectedRoute'
import { AuthProvider } from './lib/auth'
import ClaimProfilePage from './pages/ClaimProfilePage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        element: <ProtectedRoute />,
        children: [
          { index: true, element: <EventsListPage /> },
          { path: 'events', element: <EventsListPage /> },
          { path: 'events/:id', element: <EventDetailsPage /> },
          { path: 'events/:id/teams', element: <TeamsPage /> },
          { path: 'players', element: <PlayersPage /> },
        ],
      },
      { path: 'leaderboard', element: <LeaderboardPage /> },
      { path: 'events/:id/scoring', element: <ScoringPage /> },
      { path: 'scoring', element: <PublicScoringPage /> },
      { path: 'claim', element: <ClaimProfilePage /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster richColors />
    </AuthProvider>
  </React.StrictMode>
)

