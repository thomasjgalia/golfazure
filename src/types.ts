export type EventRow = {
  eventid: number
  eventname: string
  eventdate: string // ISO date
  coursename: string
  tees: string | null
  format: 'Scramble' | 'Best Ball' | 'Stroke Play' | 'Match Play' | null
  numberofholes: number
  parperhole: number[] // length 9 or 18
  islocked: boolean
  sharecode: string
  status: 'Upcoming' | 'In Progress' | 'Completed'
  created_at?: string
  updated_at?: string
}

export type PlayerRow = {
  playerid: number
  firstname: string
  lastname: string
  phone: string | null
  email: string | null
  handicap: number | null
  profile_secret?: string
  is_admin?: boolean
  created_at?: string
  updated_at?: string
}

export type TeamRow = {
  teamid: number
  eventid: number
  teamname: string
  players: { player1?: number; player2?: number; player3?: number; player4?: number }
  startinghole: number | null
  created_at?: string
  updated_at?: string
}

export type ScoreRow = {
  scoreid: number
  eventid: number
  playerid: number | null // allow null for team-level scoring
  teamid: number | null
  holenumber: number
  strokes: number | null
  par?: number | null // optional if not stored in DB
  scoretopar?: number | null // optional if not stored
  created_at?: string
  updated_at?: string
}

export type NewEvent = Omit<EventRow, 'eventid' | 'created_at' | 'updated_at'>
export type NewPlayer = Omit<PlayerRow, 'playerid' | 'created_at' | 'updated_at' | 'profile_secret'> & { profile_secret?: string }
export type NewTeam = Omit<TeamRow, 'teamid' | 'created_at' | 'updated_at'>
export type NewScore = Omit<ScoreRow, 'scoreid' | 'created_at' | 'updated_at' | 'scoretopar' | 'par'>

export function initials(p: Pick<PlayerRow, 'firstname' | 'lastname'>) {
  return `${p.firstname?.[0] ?? ''}${p.lastname?.[0] ?? ''}`.toUpperCase()
}

