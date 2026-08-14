export function classNames(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(' ')
}

export function colorForScore(scoreToPar: number) {
  if (scoreToPar < 0) return 'text-success'
  if (scoreToPar > 0) return 'text-danger'
  return 'text-info'
}

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString()

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
