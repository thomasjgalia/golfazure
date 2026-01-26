-- Add is_admin field to players table (shared between golf and cornhole apps)
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Create index for quick admin lookups
CREATE INDEX IF NOT EXISTS idx_players_is_admin ON players(is_admin) WHERE is_admin = TRUE;

-- Update RLS policies for players table
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Players are viewable by everyone" ON players;
DROP POLICY IF EXISTS "Players can be created by everyone" ON players;
DROP POLICY IF EXISTS "Players can be updated by everyone" ON players;
DROP POLICY IF EXISTS "Players can be deleted by everyone" ON players;

-- Enable RLS
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read players
CREATE POLICY "Players are viewable by everyone"
ON players FOR SELECT
USING (true);

-- For now, allow everyone to insert/update/delete
-- (We can't enforce admin-only in RLS since we're using client-side auth)
CREATE POLICY "Players can be created by everyone"
ON players FOR INSERT
WITH CHECK (true);

CREATE POLICY "Players can be updated by everyone"
ON players FOR UPDATE
USING (true);

CREATE POLICY "Players can be deleted by everyone"
ON players FOR DELETE
USING (true);

-- To designate admins, run this command in Supabase SQL Editor:
-- UPDATE players SET is_admin = TRUE WHERE email = 'tom.galia@outlook.com';
