CREATE TABLE players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firstname TEXT NOT NULL,
  lastname TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  handicap REAL,
  profile_secret TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES players(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE zone_membership (
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  role TEXT NOT NULL CHECK (role IN ('admin','member')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (zone_id, player_id)
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id INTEGER REFERENCES zones(id),
  eventname TEXT NOT NULL,
  eventdate TEXT NOT NULL,
  coursename TEXT NOT NULL,
  tees TEXT,
  format TEXT,
  numberofholes INTEGER NOT NULL,
  parperhole TEXT NOT NULL DEFAULT '[]',
  islocked INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  teamname TEXT NOT NULL,
  players TEXT NOT NULL DEFAULT '{}',
  startinghole INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  team_id INTEGER REFERENCES teams(id),
  player_id INTEGER REFERENCES players(id),
  holenumber INTEGER NOT NULL,
  strokes INTEGER,
  score_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE course_cache (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tees TEXT NOT NULL DEFAULT '[]',
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_zone ON events(zone_id);
CREATE INDEX idx_teams_event ON teams(event_id);
CREATE INDEX idx_scores_event ON scores(event_id);
CREATE INDEX idx_zone_membership_player ON zone_membership(player_id);
