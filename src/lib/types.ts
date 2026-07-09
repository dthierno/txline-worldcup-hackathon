export type TeamSide = "home" | "away";

export type WinnerPick = TeamSide | "draw";

export type TotalGoalsPick = "over" | "under";

export type LiveRoundPick = TeamSide | "none";

export type LinePick = "over" | "under";

export type Prediction = {
  homeScore: number;
  awayScore: number;
  winner: WinnerPick;
  totalGoals: TotalGoalsPick;
  totalCorners: LinePick;
  totalCards: LinePick;
  nextGoal: LiveRoundPick;
  locked: boolean;
};

export type MatchSnapshot = {
  minute: number;
  homeScore: number;
  awayScore: number;
  status: "pre" | "live" | "finished";
  statusLabel: string;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  marketNote: string;
  totalCards?: number;
  totalCorners?: number;
};

export type DemoEvent = {
  id: string;
  minute: number;
  type: "kickoff" | "goal" | "card" | "corner" | "round" | "full-time";
  title: string;
  description: string;
  snapshot: MatchSnapshot;
  scoringHint: string;
  nextGoalScorer?: TeamSide;
};

export type Player = {
  name: string;
  baseScore: number;
  trend: string;
};

export type ScoreBreakdown = {
  exactScore: number;
  winner: number;
  totalGoals: number;
  totalCards: number;
  totalCorners: number;
  nextGoal: number;
  total: number;
};
