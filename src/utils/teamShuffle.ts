// Plural animal names for auto-generated team names. Kept long enough that a
// typical outing (even a big one) won't need to repeat a name.
const ANIMAL_TEAM_NAMES = [
  'Aardvarks', 'Peahens', 'Snakes', 'Hippos', 'Meerkats', 'Hyenas', 'Ducks',
  'Squirrels', 'Geese', 'Pumas', 'Narwhals', 'Llamas', 'Sloths', 'Platypuses',
  'Rhinos', 'Walruses', 'Seagulls', 'Penguins', 'Gophers', 'Badgers',
  'Raccoons', 'Hamsters', 'Chinchillas', 'Lemurs', 'Tapirs', 'Capybaras',
  'Pelicans', 'Baboons', 'Ferrets', 'Flamingos', 'Owls', 'Porcupines',
  'Manatees', 'Emus', 'Marmots', 'Anteaters', 'Salamanders', 'Wombats',
  'Sparrows', 'Dolphins', 'Reindeer', 'Camels', 'Wallabies', 'Puffins',
  'Lobsters', 'Quolls', 'Otters', 'Hedgehogs', 'Beavers', 'Cheetahs',
  'Chameleons', 'Moose', 'Swans', 'Possums', 'Red Pandas', 'Groundhogs',
  'Alpacas', 'Ibises', 'Sea Lions', 'Skunks', 'Dingoes', 'Lynx', 'Roosters',
  'Cockatoos', 'Donkeys', 'Storks', 'Bears', 'Quails', 'Toucans', 'Yaks',
  'Armadillos', 'Cassowaries', 'Opossums', 'Honey Badgers', 'Kangaroos',
  'Gorillas', 'Parrots', 'Turkeys', 'Coyotes', 'Pigeons', 'Frogs', 'Toads',
  'Iguanas', 'Geckos', 'Ostriches', 'Eagles', 'Falcons', 'Hawks', 'Ravens',
  'Crows', 'Herons', 'Whales', 'Sharks', 'Stingrays', 'Octopuses', 'Crabs',
  'Jellyfish', 'Gazelles', 'Leopards', 'Jaguars',
]

export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

// Splits `n` players into teams of `preferredSize` (3 or 4), spreading any
// remainder across teams evenly rather than leaving one short-handed team.
// e.g. n=10, preferredSize=4 -> [4, 3, 3], not [4, 4, 2].
export function computeTeamSizes(n: number, preferredSize: 3 | 4): number[] {
  if (n <= 0) return []
  const numTeams = Math.max(1, Math.ceil(n / preferredSize))
  const base = Math.floor(n / numTeams)
  const remainder = n % numTeams
  return Array.from({ length: numTeams }, (_, i) => base + (i < remainder ? 1 : 0))
}

// Picks `count` unique animal names, avoiding any already in use. Falls back
// to numbered suffixes ("Pigs II") if the pool runs out.
export function pickAnimalNames(count: number, existingNames: Iterable<string>): string[] {
  const used = new Set(existingNames)
  const pool = shuffle(ANIMAL_TEAM_NAMES.filter((n) => !used.has(n)))
  const out: string[] = []
  for (let i = 0; out.length < count; i++) {
    if (i < pool.length) {
      out.push(pool[i]!)
      continue
    }
    // Pool exhausted (very large outing) - start reusing names with a suffix.
    const base = ANIMAL_TEAM_NAMES[i % ANIMAL_TEAM_NAMES.length]!
    const cycle = 2 + Math.floor(i / ANIMAL_TEAM_NAMES.length)
    const candidate = `${base} ${cycle}`
    if (!used.has(candidate)) out.push(candidate)
  }
  return out
}
