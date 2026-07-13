import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MatchPage } from "@/components/match-page";

import Home from "./page";

const scoreUpdates = [
  {
    action: "coverage_update",
    awayCorners: 0,
    awayGoals: 0,
    awayRedCards: 0,
    awayYellowCards: 0,
    gameState: "scheduled",
    homeCorners: 0,
    homeGoals: 0,
    homeRedCards: 0,
    homeYellowCards: 0,
    id: "0",
    seq: 0,
  },
  {
    action: "kickoff",
    awayCorners: 0,
    awayGoals: 0,
    awayRedCards: 0,
    awayYellowCards: 0,
    gameState: "scheduled",
    homeCorners: 0,
    homeGoals: 0,
    homeRedCards: 0,
    homeYellowCards: 0,
    id: "1",
    seq: 1,
  },
  {
    action: "goal",
    awayCorners: 0,
    awayGoals: 0,
    awayRedCards: 0,
    awayYellowCards: 0,
    clockSeconds: 4120,
    data: {},
    gameState: "second_half",
    homeCorners: 0,
    homeGoals: 0,
    homeRedCards: 0,
    homeYellowCards: 0,
    id: "2",
    participant: 2,
    participant1IsHome: true,
    seq: 2,
  },
  {
    action: "goal",
    awayCorners: 0,
    awayGoals: 1,
    awayRedCards: 0,
    awayYellowCards: 0,
    clockSeconds: 4120,
    data: { GoalType: "Shot", PlayerId: 222 },
    gameState: "second_half",
    homeCorners: 0,
    homeGoals: 0,
    homeRedCards: 0,
    homeYellowCards: 0,
    id: "3",
    participant: 2,
    participant1IsHome: true,
    seq: 3,
  },
  {
    action: "attack_possession",
    awayCorners: 0,
    awayGoals: 1,
    awayRedCards: 0,
    awayYellowCards: 0,
    clockSeconds: 4200,
    gameState: "second_half",
    homeCorners: 0,
    homeGoals: 0,
    homeRedCards: 0,
    homeYellowCards: 0,
    id: "4",
    participant1IsHome: true,
    possession: 2,
    seq: 4,
  },
  {
    action: "safe_possession",
    awayCorners: 0,
    awayGoals: 1,
    awayRedCards: 0,
    awayYellowCards: 0,
    clockSeconds: 4800,
    gameState: "second_half",
    homeCorners: 0,
    homeGoals: 0,
    homeRedCards: 0,
    homeYellowCards: 0,
    id: "5",
    participant1IsHome: true,
    possession: 1,
    seq: 5,
  },
  {
    action: "shot",
    awayCorners: 0,
    awayGoals: 1,
    awayRedCards: 0,
    awayYellowCards: 0,
    clockSeconds: 5000,
    data: { Outcome: "OnTarget" },
    eventId: 55,
    gameState: "second_half",
    homeCorners: 0,
    homeGoals: 0,
    homeRedCards: 0,
    homeYellowCards: 0,
    id: "6",
    participant: 2,
    participant1IsHome: true,
    seq: 6,
  },
  // Substitution siblings: the unconfirmed record has no players, the
  // confirmed one carries them (and no Participant, like real TxLINE data).
  {
    action: "substitution",
    awayCorners: 0,
    awayGoals: 1,
    awayRedCards: 0,
    awayYellowCards: 0,
    clockSeconds: 5400,
    eventId: 77,
    gameState: "second_half",
    homeCorners: 0,
    homeGoals: 0,
    homeRedCards: 0,
    homeYellowCards: 0,
    id: "7",
    participant1IsHome: true,
    seq: 7,
  },
  {
    action: "substitution",
    awayCorners: 0,
    awayGoals: 1,
    awayRedCards: 0,
    awayYellowCards: 0,
    clockSeconds: 5400,
    data: { PlayerInId: 333, PlayerOutId: 222 },
    eventId: 77,
    gameState: "second_half",
    homeCorners: 0,
    homeGoals: 0,
    homeRedCards: 0,
    homeYellowCards: 0,
    id: "8",
    participant1IsHome: true,
    seq: 8,
  },
  {
    action: "red_card",
    awayCorners: 0,
    awayGoals: 1,
    awayRedCards: 1,
    awayYellowCards: 0,
    clockSeconds: 5500,
    data: { PlayerId: 222 },
    eventId: 88,
    gameState: "second_half",
    homeCorners: 0,
    homeGoals: 0,
    homeRedCards: 0,
    homeYellowCards: 0,
    id: "8b",
    participant: 2,
    participant1IsHome: true,
    seq: 8.5,
  },
  // Devnet keeps GameState at "scheduled" even here; game_finalised is the
  // authoritative end-of-match signal.
  {
    action: "game_finalised",
    awayCorners: 0,
    awayGoals: 1,
    awayRedCards: 1,
    awayYellowCards: 0,
    clockSeconds: 5700,
    gameState: "scheduled",
    homeCorners: 0,
    homeGoals: 0,
    homeRedCards: 0,
    homeYellowCards: 0,
    id: "9",
    participant1IsHome: true,
    seq: 9,
  },
];

const futureFixture = {
  awayTeam: "Spain",
  fixtureGroup: "World Cup > Final",
  fixtureId: 999001,
  homeTeam: "France",
  kickoffUtc: "2027-01-01T20:00:00.000Z",
  stage: "Final",
};

const lineupsData = {
  teams: [
    {
      isHome: true,
      players: [
        { name: "Test Keeper", number: "1", playerId: 111, starter: true },
      ],
      teamName: "Home XI",
    },
    {
      isHome: false,
      players: [
        { name: "Ounahi, Azzedine", number: "8", playerId: 222, starter: true },
        { name: "Bench Player", number: "20", playerId: 333, starter: false },
      ],
      teamName: "Away XI",
    },
  ],
  ts: 1783183237478,
};

function mockFetch() {
  vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
    const url = String(input);
    const respond = (body: unknown) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
      });

    if (url.endsWith("/api/txline/status")) {
      return respond({
        data: {
          configured: true,
          mode: "txline",
          network: "devnet",
        },
      });
    }

    if (url.endsWith("/api/txline/fixtures")) {
      return respond({
        data: [futureFixture],
        source: "TxLINE fixtures snapshot API",
      });
    }

    if (url.includes("/api/txline/scores/") && url.endsWith("/updates")) {
      return respond({
        data: scoreUpdates,
        source: "TxLINE scores updates API",
      });
    }

    if (url.includes("/api/txline/scores/") && url.endsWith("/historical")) {
      return respond({
        data: [],
        source: "TxLINE scores historical replay API",
      });
    }

    if (url.includes("/api/txline/scores/") && url.endsWith("/lineups")) {
      return respond({
        data: lineupsData,
        source: "TxLINE score feed lineups records",
      });
    }

    if (url.includes("/api/txline/scores/") && url.endsWith("/validation")) {
      return respond({
        data: {
          fixtureId: 18185036,
          mainTreeProofCount: 3,
          statKeys: [1, 2],
          statProofCount: 2,
          subTreeProofCount: 4,
          ts: 1782934303,
          updateCount: 1123,
        },
        source: "TxLINE stat validation API",
      });
    }

    if (url.includes("/api/txline/odds/") && url.endsWith("/updates")) {
      return respond({
        data: {
          count: 64017,
          latestTs: 1782795643574,
          marketTypes: ["1X2_PARTICIPANT_RESULT"],
          series: [
            { away: 48.7, draw: 28.2, home: 23.1, ts: 1782792043574 },
            { away: 48.0, draw: 27.0, home: 25.0, ts: 1782795643574 },
          ],
        },
        source: "TxLINE live odds updates API",
      });
    }

    if (url.includes("/api/txline/scores/")) {
      return respond({
        data: {
          action: "comment",
          awayCorners: 0,
          awayGoals: 0,
          awayRedCards: 0,
          awayYellowCards: 0,
          gameState: "scheduled",
          homeCorners: 0,
          homeGoals: 0,
          homeRedCards: 0,
          homeYellowCards: 0,
          seq: 1,
        },
        source: "TxLINE scores snapshot API",
      });
    }

    if (url.includes("/api/txline/odds/")) {
      return respond({
        data: {
          awayWinProbability: 14.5,
          drawProbability: 42,
          homeWinProbability: 43.5,
          marketNote: "TxLINE 1X2: 43.5% / 42.0% / 14.5%",
          markets: [],
        },
        source: "TxLINE odds snapshot API",
      });
    }

    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

describe("Home", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders separate matches, groups, and bracket views", async () => {
    const user = userEvent.setup();

    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "PredGame" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Matches/i }));
    expect(
      screen.getByRole("link", { name: /Canada vs Morocco/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Groups/i }));
    expect(screen.getByText("Group A")).toBeInTheDocument();
    expect(screen.getAllByText("South Africa").length).toBeGreaterThan(0);
    expect(screen.queryByText("Round of 32")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Bracket/i }));
    expect(screen.getByText("Round of 32")).toBeInTheDocument();
    expect(screen.getByText("Round of 16")).toBeInTheDocument();
    expect(screen.getByText("Quarter-finals")).toBeInTheDocument();
    expect(screen.queryByText("Group A")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next round" }));
    expect(screen.getByText("Semi-finals")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Run Demo Replay" }),
    ).not.toBeInTheDocument();
  });

  it("links each game to its own match page", async () => {
    const user = userEvent.setup();

    render(<Home />);

    await user.click(screen.getByRole("tab", { name: /Matches/i }));
    expect(
      screen.getByRole("link", { name: /Canada vs Morocco/i }),
    ).toHaveAttribute("href", "/match/18185036");
    expect(
      screen.getByRole("link", { name: /France vs Morocco/i }),
    ).toHaveAttribute("href", "/match/18209181");
  });
});

describe("MatchPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows TxLINE match details on its own page", async () => {
    render(<MatchPage fixtureId={18209181} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "France vs Morocco" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("0-1")).toBeInTheDocument();
    // game_finalised in the feed must mark the match Finished even though
    // TxLINE's GameState still says "scheduled".
    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(screen.getByText(/TxLINE 1X2/i)).toBeInTheDocument();
    expect(screen.getByText("Kickoff.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "69' Goal for Morocco (Shot) - Ounahi, Azzedine. Score 0-1.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("⚽ 69' Ounahi, Azzedine (0-1)"),
    ).toBeInTheDocument();
    // Red card: square in the heading next to Morocco, and next to the
    // player in the lineups.
    expect(
      screen.getByRole("heading", { level: 1, name: /France vs Morocco/ })
        .textContent,
    ).toContain("🟥");
    expect(screen.getByText(/Ounahi, Azzedine ⚽ 🟥/)).toBeInTheDocument();
    expect(screen.getByText("Possession (ball in play)")).toBeInTheDocument();
    expect(screen.getByText("Total shots")).toBeInTheDocument();
    expect(screen.getByText(/#8 Ounahi, Azzedine ⚽/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "91' Substitution for Away XI: Bench Player on, Ounahi, Azzedine off.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/▲ Bench Player/)).toBeInTheDocument();
    expect(screen.getByText(/▼ 91'/)).toBeInTheDocument();
    expect(screen.queryByText("Goal - score 0-0")).not.toBeInTheDocument();
    expect(screen.queryByText(/seq/i)).not.toBeInTheDocument();
    // Base UI's Button sets role="button" on the rendered <a>.
    expect(
      screen.getByRole("button", { name: "Back to games" }),
    ).toHaveAttribute("href", "/");
  });

  it("lets a fan save a prediction before kickoff", async () => {
    const user = userEvent.setup();

    render(<MatchPage fixtureId={999001} />);

    expect(
      await screen.findByRole("heading", { level: 1, name: /France vs Spain/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Your prediction" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Locks at kickoff/i)).toBeInTheDocument();

    await user.selectOptions(
      await screen.findByLabelText(/First scorer/),
      "222",
    );
    await user.click(screen.getByRole("button", { name: "Save prediction" }));

    expect(
      screen.getByText(/Prediction saved on this device/i),
    ).toBeInTheDocument();

    const stored = JSON.parse(
      window.localStorage.getItem("fan-forecast.predictions.v1") ?? "{}",
    );

    expect(stored["999001"]).toMatchObject({
      awayGoals: 1,
      firstScorer: { name: "Ounahi, Azzedine", playerId: 222 },
      fixtureId: 999001,
      homeGoals: 1,
      winner: "draw",
    });
  });

  it("settles a locked prediction from TxLINE score data", async () => {
    window.localStorage.setItem(
      "fan-forecast.predictions.v1",
      JSON.stringify({
        "18185036": {
          awayGoals: 1,
          firstScorer: { name: "Ounahi, Azzedine", playerId: 222 },
          fixtureId: 18185036,
          homeGoals: 0,
          savedAt: "2026-07-04T10:00:00.000Z",
          totalCards: "under",
          totalCorners: "under",
          totalGoals: "under",
          winner: "away",
        },
      }),
    );

    render(<MatchPage fixtureId={18185036} />);

    expect(await screen.findByText("Final settlement")).toBeInTheDocument();
    // 6 first scorer + 5 exact + 3 winner + 2 goals under + 2 corners under
    // + 2 cards under
    expect(screen.getByText(/Total: 20 point\(s\)/)).toBeInTheDocument();
    expect(screen.getByText("First scorer")).toBeInTheDocument();
    expect(
      screen.getByText(/Verified score: Canada 0 - Morocco 1/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not submit an on-chain transaction/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Odds movement \(1X2\): 2 meaningful change\(s\)/),
    ).toBeInTheDocument();
  });
});
