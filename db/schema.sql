-- LinkUp schema. Idempotent: safe to run on every boot.

CREATE TABLE IF NOT EXISTS rooms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE NOT NULL,
  status          text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'swiping')),
  location_label  text NOT NULL,
  lat             double precision NOT NULL,
  lng             double precision NOT NULL,
  radius_m        integer NOT NULL,
  price_levels    smallint[] NOT NULL DEFAULT '{}',
  cuisine         text,
  provider        text NOT NULL DEFAULT 'demo',
  -- Free-form preference payload; reserved for the AI layer (structured prefs from natural language).
  preferences     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz
);

CREATE TABLE IF NOT EXISTS participants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL,
  token       text NOT NULL,           -- secret the browser presents to act as this participant
  is_host     boolean NOT NULL DEFAULT false,
  is_ready    boolean NOT NULL DEFAULT false,
  joined_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS participants_room_idx ON participants(room_id);

-- The shared restaurant pool for a room, in display order.
CREATE TABLE IF NOT EXISTS room_restaurants (
  room_id     uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  place_id    text NOT NULL,
  position    integer NOT NULL,
  score       double precision,
  data        jsonb NOT NULL,
  PRIMARY KEY (room_id, place_id)
);

-- Votes are private: only ever read back by their owner, or aggregated.
CREATE TABLE IF NOT EXISTS votes (
  room_id         uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id  uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  place_id        text NOT NULL,
  liked           boolean NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (participant_id, place_id)
);
CREATE INDEX IF NOT EXISTS votes_room_place_idx ON votes(room_id, place_id) WHERE liked;

CREATE TABLE IF NOT EXISTS matches (
  room_id     uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  place_id    text NOT NULL,
  likes       integer NOT NULL,
  matched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, place_id)
);

-- v2: AI preferences. Each participant can describe what they want in plain words.
ALTER TABLE participants ADD COLUMN IF NOT EXISTS wish       text;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS wish_prefs jsonb;
