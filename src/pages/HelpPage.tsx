import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-2">{children}</CardContent>
    </Card>
  )
}

export default function HelpPage() {
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-semibold">Help</h1>

      <Section title="Zones">
        <p>
          A Zone is your own isolated group - its own events, teams, scores, and player
          roster, completely separate from any other zone. You can belong to more than
          one zone; a switcher appears in the header once you do. Any player can create a
          new zone from scratch and becomes its admin.
        </p>
      </Section>

      <Section title="Setting up an event">
        <p>Only a zone admin can create events. When creating one, you'll set:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Event name, date, tees, and number of holes</li>
          <li>Course - search for a real course or pick from previously saved ones (see below)</li>
          <li><strong className="text-foreground">Format</strong> - this decides how scoring works, so get it right before scores start coming in (see below)</li>
          <li>Par per hole - auto-filled by course search, or editable by hand</li>
        </ul>
      </Section>

      <Section title="Teams are always required">
        <p>
          Even for formats scored per-player (Stroke Play, Stableford), you still need to
          create a "Team" for each playing group before scoring can start. Here "team"
          just means a group of up to four players who play together and enter scores
          together on one screen - not necessarily a competitive team.
        </p>
        <p>
          Use <strong className="text-foreground">Auto-Assign Teams</strong> to randomly
          split your roster into groups of 3 or 4 (with an option to reshuffle players
          already on a team), or <strong className="text-foreground">Create Team</strong> to
          build one by hand.
        </p>
      </Section>

      <Section title="Scoring formats">
        <p>
          Format is set once, at event creation, and drives both how scores get entered
          and how the leaderboard ranks players. Choose it carefully before anyone starts
          entering scores - switching formats mid-event can leave earlier scores
          inconsistent with the new entry style.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong className="text-foreground">Scramble</strong> - one shared score per team per hole. Lowest total wins.</li>
          <li><strong className="text-foreground">Best Ball</strong> - same one-score-per-team entry as Scramble; use it when your house rules already settle on the team's best ball before it's entered.</li>
          <li><strong className="text-foreground">Stroke Play</strong> - every player enters their own score each hole. Lowest total score-to-par wins.</li>
          <li><strong className="text-foreground">Stableford</strong> - every player enters their own score each hole, but points (birdie = 3, par = 2, bogey = 1, etc.) decide the winner - highest total points wins, the opposite of every other format here.</li>
        </ul>
      </Section>

      <Section title="Course search &amp; saved courses">
        <p>
          When creating or editing an event, use "Look up course" to search a real course
          database - pick a course and tee, and it auto-fills the course name, hole
          count, and par for every hole.
        </p>
        <p>
          Once a course has been looked up, it's saved for good, so it shows up as a
          quick-pick under "Previously used courses" next time - for anyone, in any zone -
          with no search needed. A given course only ever needs to be looked up once.
        </p>
      </Section>
    </div>
  )
}
