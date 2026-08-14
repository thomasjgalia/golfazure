export function classNames(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(' ')
}

export function colorForScore(scoreToPar: number) {
  if (scoreToPar < 0) return 'text-success'
  if (scoreToPar > 0) return 'text-danger'
  return 'text-info'
}

// `new Date("2026-10-03")` parses the string as UTC midnight, so formatting
// it in any timezone behind UTC (all of North America) rolls it back a day.
// eventdate is a plain calendar date with no time/timezone meaning, so build
// the Date from its components using the local-timezone constructor instead
// of round-tripping through UTC parsing.
export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString()
}

// Standard Stableford points table. Higher is better - opposite of stroke play.
export function stablefordPoints(strokes: number, par: number) {
  const diff = strokes - par
  if (diff <= -3) return 5 // albatross or better
  if (diff === -2) return 4 // eagle
  if (diff === -1) return 3 // birdie
  if (diff === 0) return 2 // par
  if (diff === 1) return 1 // bogey
  return 0 // double bogey or worse
}

export function statusBadgeClass(status: string | null | undefined) {
  if (status === 'In Progress') return 'border-success bg-success/10 text-success'
  if (status === 'Completed') return 'border-input bg-muted text-muted-foreground'
  return 'border-info bg-info/10 text-info' // Upcoming
}
