import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const nav = useNavigate()
  const location = useLocation() as any
  const from = location.state?.from?.pathname || '/events'
  const { user } = useAuth()


  useEffect(() => {
    if (user) nav(from, { replace: true })
  }, [user])




























  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  async function sendMagicLink() {
    const emailRe = /.+@.+\..+/i
    if (!email || !emailRe.test(email)) {
      toast.error('Enter a valid email')
      return
    }
    try {
      setLoading(true)
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
      if (error) throw error
      toast.success('Magic link sent. Check your email.')
      setCooldown(30)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="text-sm text-muted-foreground">For registered users, enter your email to log in. If you are a new user, enter your email and we’ll send you a one-time sign-in link. No password required.</p>

      <div className="grid gap-3">
        <div className="text-sm">
          Don’t have an account yet? <a className="text-primary underline" href="/claim">Claim your profile</a> to get a magic link.
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button variant="outline" disabled={loading || !email || cooldown > 0} onClick={sendMagicLink}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send magic link'}
        </Button>
        <p className="text-xs text-muted-foreground">You’ll stay signed in on this device. If you sign out or use a new device, request a new link.</p>
        <p className="text-xs text-muted-foreground">If you don’t see the email, check your Spam/Promotions folder, or try a different email address.</p>
      </div>
    </div>
  )
}
