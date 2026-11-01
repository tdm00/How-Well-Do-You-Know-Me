export type Phase = "setup" | "answering" | "revealing" | "final";

export type Direction = "a_predicts_b" | "b_predicts_a";

export type RevealField = "aOwn" | "aPred" | "bOwn" | "bPred";

export type Mark = "match" | "miss" | null;

export type LeaderboardGroup = {
  rank: number;
  points: number;
  teams: { id: string; name: string; points: number }[];
};

export type LockProgress = { locked: number; total: number };

export type QuestionRef = { prompt: string; category: string | null };

export type TvFocus = {
  id: string;
  name: string;
  partnerA: string;
  partnerB: string;
  aOwn: string | null;
  aPred: string | null;
  bOwn: string | null;
  bPred: string | null;
  judgeAPredictsB: Mark;
  judgeBPredictsA: Mark;
};

export type TvTeam = {
  id: string;
  name: string;
  points: number;
  partnerA: string | null;
  partnerB: string | null;
};

export type TvState = {
  role: "tv";
  code: string;
  phase: Phase;
  round: number;
  position: number;
  passHint: boolean;
  question: QuestionRef | null;
  lockProgress: LockProgress;
  leaderboard: LeaderboardGroup[];
  focus: TvFocus | null;
  teams: TvTeam[];
};

export type HostPlayer = { id: string; name: string };

export type HostAnswerSide = {
  playerId: string;
  name: string;
  own: string | null;
  prediction: string | null;
  locked: boolean;
};

export type HostTeamCard = {
  id: string;
  name: string;
  points: number;
  partnerA: HostAnswerSide | null;
  partnerB: HostAnswerSide | null;
  shown: { aOwn: boolean; aPred: boolean; bOwn: boolean; bPred: boolean };
  judgeAPredictsB: Mark;
  judgeBPredictsA: Mark;
};

export type HostTeam = {
  id: string;
  name: string;
  points: number;
  slotA: HostPlayer | null;
  slotB: HostPlayer | null;
};

export type LibraryQuestion = {
  id: string;
  prompt: string;
  category: string | null;
};

export type HostState = {
  role: "host";
  code: string;
  phase: Phase;
  round: number;
  position: number;
  passHint: boolean;
  stallDeadline: number | null;
  question: QuestionRef | null;
  canAdvance: boolean;
  advanceHint: string;
  undoLabel: string | null;
  leaderboard: LeaderboardGroup[];
  focusTeamId: string | null;
  teams: HostTeam[];
  unassigned: HostPlayer[];
  library: LibraryQuestion[];
  round1: string[];
  round2: string[];
  cards: HostTeamCard[];
  lockProgress: LockProgress;
  canEditRound2: boolean;
};

export type PlayerState = {
  role: "player";
  code: string;
  phase: Phase;
  round: number;
  position: number;
  name: string;
  teamName: string | null;
  question: QuestionRef | null;
  locked: boolean;
  needsTeam: boolean;
};

export type GameState = TvState | HostState | PlayerState;

export type GameAction =
  | { action: "add-team"; name: string }
  | { action: "rename-team"; teamId: string; name: string }
  | { action: "remove-team"; teamId: string }
  | { action: "assign"; playerId: string; teamId: string; slot: "a" | "b" }
  | { action: "unassign"; playerId: string }
  | { action: "remove-player"; playerId: string }
  | { action: "import-questions"; text: string }
  | { action: "load-sample" }
  | { action: "set-round"; round: 1 | 2; questionIds: string[] }
  | { action: "start" }
  | { action: "lock"; own: string; prediction: string }
  | { action: "reveal"; teamId: string; field: RevealField }
  | { action: "focus"; teamId: string }
  | { action: "judge"; teamId: string; direction: Direction; match: boolean }
  | { action: "undo" }
  | { action: "advance" }
  | { action: "stall" }
  | { action: "dismiss-hint" };
