// Team → visual identity maps shared by fan-facing surfaces (homepage cards,
// match page hero). Flags come from flagcdn.com (free CDN); glows are each
// nation's recognised primary kit/flag colour.

const titleIso: Array<[string, string]> = [
  ["france", "fr"], ["morocco", "ma"], ["spain", "es"], ["belgium", "be"],
  ["england", "gb-eng"], ["norway", "no"], ["argentina", "ar"],
  ["switzerland", "ch"], ["egypt", "eg"], ["colombia", "co"],
  ["mexico", "mx"], ["canada", "ca"], ["brazil", "br"], ["portugal", "pt"],
  ["paraguay", "py"], ["usa", "us"],
  ["south africa", "za"], ["korea", "kr"], ["czech", "cz"], ["bosnia", "ba"],
  ["qatar", "qa"], ["scotland", "gb-sct"], ["haiti", "ht"],
  ["australia", "au"], ["türkiye", "tr"], ["turkey", "tr"], ["germany", "de"],
  ["ivory", "ci"], ["ecuador", "ec"], ["cura", "cw"], ["netherlands", "nl"],
  ["japan", "jp"], ["sweden", "se"], ["tunisia", "tn"], ["iran", "ir"],
  ["zealand", "nz"], ["cape verde", "cv"], ["uruguay", "uy"], ["saudi", "sa"],
  ["senegal", "sn"], ["iraq", "iq"], ["austria", "at"], ["algeria", "dz"],
  ["jordan", "jo"], ["congo", "cd"], ["uzbekistan", "uz"], ["croatia", "hr"],
  ["ghana", "gh"], ["panama", "pa"],
];

export function teamFlag(team: string): string | undefined {
  const lower = team.toLowerCase();

  return titleIso.find(([name]) => lower.includes(name))?.[1];
}

export const teamGlow: Record<string, string> = {
  ar: "#38bdf8", at: "#dc2626", au: "#eab308", ba: "#2563eb",
  be: "#ef4444", br: "#facc15", ca: "#dc2626", cd: "#ef4444",
  ch: "#dc2626", ci: "#f97316", co: "#facc15", cv: "#2563eb",
  cw: "#2563eb", cz: "#dc2626", de: "#d4d4d8", dz: "#16a34a",
  ec: "#eab308", eg: "#dc2626", es: "#dc2626", fr: "#3b82f6",
  "gb-eng": "#e5e7eb", "gb-sct": "#1e40af", gh: "#dc2626", hr: "#dc2626",
  ht: "#2563eb", iq: "#16a34a", ir: "#16a34a", jo: "#dc2626",
  jp: "#2563eb", kr: "#ef4444", ma: "#dc2626", mx: "#16a34a",
  nl: "#f97316", no: "#ef4444", nz: "#d4d4d8", pa: "#dc2626",
  pt: "#dc2626", py: "#ef4444", qa: "#9f1239", sa: "#16a34a",
  se: "#eab308", sn: "#16a34a", tn: "#dc2626", tr: "#dc2626",
  us: "#3b82f6", uy: "#38bdf8", uz: "#2563eb", za: "#eab308",
};
