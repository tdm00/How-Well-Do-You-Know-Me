import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const MIGRATION = `
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  host_token TEXT NOT NULL,
  phase TEXT NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 1,
  focus_team_id TEXT,
  stall_deadline INTEGER,
  pass_hint INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  team_id TEXT,
  slot TEXT,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  category TEXT,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE IF NOT EXISTS round_picks (
  game_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  position INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  PRIMARY KEY (game_id, round, position),
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  position INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  own_answer TEXT NOT NULL,
  prediction TEXT NOT NULL,
  locked_at INTEGER NOT NULL,
  UNIQUE (game_id, round, position, player_id),
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE IF NOT EXISTS reveals (
  game_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  position INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  show_a_own INTEGER NOT NULL DEFAULT 0,
  show_a_pred INTEGER NOT NULL DEFAULT 0,
  show_b_own INTEGER NOT NULL DEFAULT 0,
  show_b_pred INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, round, position, team_id),
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE IF NOT EXISTS judgments (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  position INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  is_match INTEGER NOT NULL,
  points INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (game_id, round, position, team_id, direction),
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE INDEX IF NOT EXISTS idx_teams_game ON teams(game_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_questions_game ON questions(game_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_answers_lookup ON answers(game_id, round, position);
CREATE INDEX IF NOT EXISTS idx_judgments_game ON judgments(game_id);
`;

type Sql = Database.Database;

const globalForDb = globalThis as unknown as { dykmDb?: Sql; dykmPath?: string };

export function getDb(): Sql {
  const file = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "data", "game.db");

  if (globalForDb.dykmDb && globalForDb.dykmPath === file) {
    return globalForDb.dykmDb;
  }
  if (globalForDb.dykmDb) {
    globalForDb.dykmDb.close();
    globalForDb.dykmDb = undefined;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 3000");
  db.exec(MIGRATION);
  globalForDb.dykmDb = db;
  globalForDb.dykmPath = file;
  return db;
}

export function resetDbForTests(): void {
  if (globalForDb.dykmDb) {
    globalForDb.dykmDb.close();
    globalForDb.dykmDb = undefined;
    globalForDb.dykmPath = undefined;
  }
}
