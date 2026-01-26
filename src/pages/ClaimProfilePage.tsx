import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { PlayerRow } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { UserCheck, ArrowLeft } from 'lucide-react'

export default function ClaimProfilePage() {
  const navigate = useNavigate()
  const { claimProfile, isProfileClaimed } = useAuth()
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('')
  const [secret, setSecret] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadPlayers()
  }, [])

  useEffect(() => {
    if (isProfileClaimed) {
      navigate('/')
    }
  }, [isProfileClaimed, navigate])

  async function loadPlayers() {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('lastname', { ascending: true })
        .order('firstname', { ascending: true })

      if (error) throw error
      setPlayers(data || [])
    } catch (error) {
      toast.error('Failed to load players')
      console.error(error)
    }
  }

  async function handleClaim() {
    if (!selectedPlayerId) {
      toast.error('Please select a player')
      return
    }

    if (!secret.trim()) {
      toast.error('Please enter your profile secret')
      return
    }

    setLoading(true)
    try {
      // Find the selected player
      const { data: player, error } = await supabase
        .from('players')
        .select('*')
        .eq('playerid', parseInt(selectedPlayerId))
        .single()

      if (error) throw error

      if (!player) {
        toast.error('Player not found')
        return
      }

      // Check if player has a profile secret set
      if (!player.profile_secret) {
        toast.error('This profile does not have a secret set. Contact the tournament organizer.')
        return
      }

      // Validate the secret (case-insensitive for user convenience)
      if (player.profile_secret.toLowerCase() !== secret.trim().toLowerCase()) {
        toast.error('Invalid secret code')
        return
      }

      // Success! Claim the profile
      claimProfile(player)
      toast.success(`Welcome, ${player.firstname}!`)
      navigate('/')
    } catch (error) {
      toast.error('Failed to claim profile')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">Claim Your Profile</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Profile Authentication
          </CardTitle>
          <CardDescription>
            Select your name and enter your profile secret to claim your profile
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="player">Your Name</Label>
            <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
              <SelectTrigger id="player">
                <SelectValue placeholder="Select your name" />
              </SelectTrigger>
              <SelectContent>
                {players.map((player) => (
                  <SelectItem key={player.playerid} value={player.playerid.toString()}>
                    {player.lastname}, {player.firstname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="secret">Profile Secret</Label>
            <Input
              id="secret"
              type="password"
              placeholder="Enter your secret code"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleClaim()}
            />
            <p className="text-xs text-muted-foreground">
              Contact the tournament organizer if you don't know your secret
            </p>
          </div>

          <Button className="w-full" onClick={handleClaim} disabled={loading}>
            {loading ? 'Claiming...' : 'Claim Profile'}
          </Button>
        </CardContent>
      </Card>

      <div className="mt-6 p-4 bg-muted rounded-lg">
        <h3 className="font-semibold mb-2">Why claim your profile?</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• View your tournament history</li>
          <li>• Track your teams and matches</li>
          <li>• Quick access to your events</li>
        </ul>
      </div>
    </div>
  )
}
