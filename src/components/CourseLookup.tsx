import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type CourseFill = { coursename: string; tees: string; numberofholes: number; parperhole: number[] }

type SearchResult = { id: string | number; name: string; location: string }
type TeeOption = { label: string; numberOfHoles: number; parPerHole: number[] }
type CourseDetail = { id: string | number; name: string; tees: TeeOption[] }

// Lets an admin search golfcourseapi.com for a real course and auto-fill
// course name / hole count / par per hole instead of typing them by hand.
// Purely optional - the manual fields below it still work if this finds nothing.
export default function CourseLookup({ onApply }: { onApply: (fill: CourseFill) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [teeIndex, setTeeIndex] = useState<number | null>(null)
  const [loadingCourse, setLoadingCourse] = useState(false)

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([])
      return
    }
    const handle = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await api.get<{ courses: SearchResult[] }>(`/golf-courses/search?q=${encodeURIComponent(query.trim())}`)
        setResults(data.courses)
        setError(null)
      } catch (e: any) {
        setResults([])
        setError(e.message || 'Course search failed')
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(handle)
  }, [query])

  function applyTee(c: CourseDetail, idx: number) {
    const tee = c.tees[idx]
    if (!tee || !Array.isArray(tee.parPerHole) || tee.parPerHole.length === 0 || !Number.isFinite(tee.numberOfHoles)) {
      setError('This tee is missing par data - enter details manually below')
      return
    }
    onApply({ coursename: c.name, tees: tee.label, numberofholes: tee.numberOfHoles, parperhole: tee.parPerHole })
  }

  async function pickCourse(result: SearchResult) {
    setResults([])
    setQuery(result.name)
    setCourse(null)
    setTeeIndex(null)
    setLoadingCourse(true)
    try {
      const data = await api.get<CourseDetail>(`/golf-courses/${result.id}`)
      setCourse(data)
      setError(data.tees.length === 0 ? 'No tee/par data available for this course - enter details manually below' : null)
      if (data.tees.length === 1) {
        setTeeIndex(0)
        applyTee(data, 0)
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load course details')
    } finally {
      setLoadingCourse(false)
    }
  }

  return (
    <div className="relative">
      <Label>Look up course (optional)</Label>
      <Input
        placeholder="Search for a course to autofill par..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setCourse(null)
        }}
      />
      {searching && <div className="text-xs text-muted-foreground mt-1">Searching...</div>}
      {loadingCourse && <div className="text-xs text-muted-foreground mt-1">Loading course...</div>}
      {error && <div className="text-xs text-danger mt-1">{error}</div>}

      {results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full border rounded bg-white shadow max-h-56 overflow-auto">
          {results.map((r) => (
            <button
              type="button"
              key={r.id}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-muted"
              onClick={() => pickCourse(r)}
            >
              <div className="font-medium">{r.name}</div>
              {r.location && <div className="text-xs text-muted-foreground">{r.location}</div>}
            </button>
          ))}
        </div>
      )}

      {course && course.tees.length > 1 && (
        <div className="mt-2">
          <Label>Tee</Label>
          <select
            className="border rounded px-2 py-1 w-full"
            value={teeIndex ?? ''}
            onChange={(e) => {
              const idx = Number(e.target.value)
              setTeeIndex(idx)
              applyTee(course, idx)
            }}
          >
            <option value="" disabled>Select tee</option>
            {course.tees.map((t, i) => (
              <option key={i} value={i}>{t.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
