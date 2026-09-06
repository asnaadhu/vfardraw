/*
# Create database tables for Annual Staff Lucky Draw

This migration sets up the database schema for a staff lucky draw / raffle application.
The app has no sign-in screen — it is a single-tenant, shared-data app used during a live event.
All policies allow both `anon` and `authenticated` roles because the frontend uses the anon key.

## Tables

### staff_members
Stores the staff eligible for the draw, grouped into 3 categories.
- `id` (uuid, primary key)
- `staff_id` (text) — employee ID or code, unique within a category
- `name` (text) — staff member's full name
- `dept` (text) — department / role description
- `category` (text) — one of 'cat1', 'cat2', 'cat3'
- `is_drawn` (boolean, default false) — whether this person has already won
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### prizes
Stores the prize list in draw order.
- `id` (uuid, primary key)
- `rank` (int) — draw order position (1-based)
- `name` (text) — the prize description
- `drawn_at` (timestamptz, nullable) — when the winner for this prize was drawn
- `created_at` (timestamptz)

### winners
Records each draw result — which staff member won which prize.
- `id` (uuid, primary key)
- `rank` (int) — the prize draw order
- `prize_name` (text) — the prize won
- `staff_id` (text) — the winner's employee ID
- `staff_name` (text) — the winner's name
- `dept` (text) — the winner's department
- `category` (text) — which category pool the winner was drawn from
- `drawn_at` (timestamptz) — when the draw happened

### draw_settings
Single-row table storing app configuration: tier rules and raw text inputs.
- `id` (int, primary key, always 1)
- `cat1_cutoff` (int) — prizes 1..N are cat1 tier
- `cat2_cutoff` (int) — prizes N+1..M are cat2 tier
- `raw_prizes` (text) — raw text input for prizes
- `raw_cat1` (text) — raw text input for cat1 staff
- `raw_cat2` (text) — raw text input for cat2 staff
- `raw_cat3` (text) — raw text input for cat3 staff
- `current_prize_index` (int) — the next prize to draw
- `updated_at` (timestamptz)

## Security
- RLS enabled on all tables.
- All tables use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)` because
  this is a single-tenant shared-data app with no sign-in screen. The data is intentionally public
  within the app context (used on a single machine during a live event).
- Four separate policies per table (SELECT, INSERT, UPDATE, DELETE).

## Important Notes
1. The `staff_members` table has a unique constraint on `(staff_id, category)` to prevent duplicate entries within a category.
2. The `draw_settings` table is designed as a singleton (id = 1). The app reads/updates only this row.
3. When a winner is drawn, the corresponding `staff_members.is_drawn` is set to true and the `prizes.drawn_at` is timestamped.
4. Resetting the draw clears winners, un-marks all staff, and resets prize draw timestamps and current_prize_index.
*/

-- Staff members table
CREATE TABLE IF NOT EXISTS staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL,
  name text NOT NULL,
  dept text NOT NULL DEFAULT 'General',
  category text NOT NULL CHECK (category IN ('cat1', 'cat2', 'cat3')),
  is_drawn boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_members_staff_id_category_idx
  ON staff_members (lower(staff_id), category);

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_staff" ON staff_members;
CREATE POLICY "anon_select_staff" ON staff_members FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_staff" ON staff_members;
CREATE POLICY "anon_insert_staff" ON staff_members FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_staff" ON staff_members;
CREATE POLICY "anon_update_staff" ON staff_members FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_staff" ON staff_members;
CREATE POLICY "anon_delete_staff" ON staff_members FOR DELETE
  TO anon, authenticated USING (true);

-- Prizes table
CREATE TABLE IF NOT EXISTS prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank int NOT NULL,
  name text NOT NULL,
  drawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_prizes" ON prizes;
CREATE POLICY "anon_select_prizes" ON prizes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_prizes" ON prizes;
CREATE POLICY "anon_insert_prizes" ON prizes FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_prizes" ON prizes;
CREATE POLICY "anon_update_prizes" ON prizes FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_prizes" ON prizes;
CREATE POLICY "anon_delete_prizes" ON prizes FOR DELETE
  TO anon, authenticated USING (true);

-- Winners table
CREATE TABLE IF NOT EXISTS winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank int NOT NULL,
  prize_name text NOT NULL,
  staff_id text NOT NULL,
  staff_name text NOT NULL,
  dept text NOT NULL DEFAULT 'General',
  category text NOT NULL CHECK (category IN ('cat1', 'cat2', 'cat3')),
  drawn_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS winners_rank_idx ON winners (rank);

ALTER TABLE winners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_winners" ON winners;
CREATE POLICY "anon_select_winners" ON winners FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_winners" ON winners;
CREATE POLICY "anon_insert_winners" ON winners FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_winners" ON winners;
CREATE POLICY "anon_update_winners" ON winners FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_winners" ON winners;
CREATE POLICY "anon_delete_winners" ON winners FOR DELETE
  TO anon, authenticated USING (true);

-- Draw settings table (singleton: id = 1)
CREATE TABLE IF NOT EXISTS draw_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cat1_cutoff int NOT NULL DEFAULT 10,
  cat2_cutoff int NOT NULL DEFAULT 30,
  raw_prizes text NOT NULL DEFAULT '',
  raw_cat1 text NOT NULL DEFAULT '',
  raw_cat2 text NOT NULL DEFAULT '',
  raw_cat3 text NOT NULL DEFAULT '',
  current_prize_index int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE draw_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_settings" ON draw_settings;
CREATE POLICY "anon_select_settings" ON draw_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_settings" ON draw_settings;
CREATE POLICY "anon_insert_settings" ON draw_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_settings" ON draw_settings;
CREATE POLICY "anon_update_settings" ON draw_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_settings" ON draw_settings;
CREATE POLICY "anon_delete_settings" ON draw_settings FOR DELETE
  TO anon, authenticated USING (true);

-- Insert the singleton settings row if it doesn't exist
INSERT INTO draw_settings (id, cat1_cutoff, cat2_cutoff)
VALUES (1, 10, 30)
ON CONFLICT (id) DO NOTHING;