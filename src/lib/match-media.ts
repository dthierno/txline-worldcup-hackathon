// Curated media-partner clips per fixture. The official highlights card is
// powered live by FIFA.com's content API (see lib/fifa-highlights.ts); this
// map only holds the extra regional broadcaster clip FotMob shows above it,
// which has no public feed we can resolve automatically.

export type MatchClip = {
  thumbnail: string;
  title: string;
  url: string;
};

export const matchClips: Record<number, MatchClip> = {
  // Norway vs England (quarter-final) - WSC/TSN partner clip.
  18213979: {
    thumbnail:
      "https://wsc.tsn.ca/games/0efeb2080863c8975fbcc885158ae2bf/a7c3f99c-34bb-48e7-a135-95e649a17a5d_0.jpg",
    title: "Norway vs. England",
    url: "https://wsc.tsn.ca/games/6a52b0028a0342599ed8870d.html?utm_source=Fotmob",
  },
};
