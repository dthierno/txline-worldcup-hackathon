// 2026 World Cup group-stage final standings. Teams and results are the same
// tournament the knockout bracket below draws from (top two of each group plus
// the eight best third-placed sides advance to the Round of 32). `adv` marks a
// team that reached the knockout stage, matching the bracket in this app.
type Row = [
  name: string,
  iso: string,
  w: number,
  d: number,
  l: number,
  gd: number,
  pts: number,
  adv: boolean,
];

const GROUPS: { name: string; rows: Row[] }[] = [
  {
    name: "Group A",
    rows: [
      ["Mexico", "mx", 3, 0, 0, 6, 9, true],
      ["South Africa", "za", 1, 1, 1, -1, 4, true],
      ["South Korea", "kr", 1, 0, 2, -1, 3, false],
      ["Czechia", "cz", 0, 1, 2, -4, 1, false],
    ],
  },
  {
    name: "Group B",
    rows: [
      ["Switzerland", "ch", 2, 1, 0, 4, 7, true],
      ["Canada", "ca", 1, 1, 1, 5, 4, true],
      ["Bosnia & Herz.", "ba", 1, 1, 1, -1, 4, true],
      ["Qatar", "qa", 0, 1, 2, -8, 1, false],
    ],
  },
  {
    name: "Group C",
    rows: [
      ["Brazil", "br", 2, 1, 0, 6, 7, true],
      ["Morocco", "ma", 2, 1, 0, 3, 7, true],
      ["Scotland", "gb-sct", 1, 0, 2, -3, 3, false],
      ["Haiti", "ht", 0, 0, 3, -6, 0, false],
    ],
  },
  {
    name: "Group D",
    rows: [
      ["USA", "us", 2, 0, 1, 4, 6, true],
      ["Australia", "au", 1, 1, 1, 0, 4, true],
      ["Paraguay", "py", 1, 1, 1, -2, 4, true],
      ["Türkiye", "tr", 1, 0, 2, -2, 3, false],
    ],
  },
  {
    name: "Group E",
    rows: [
      ["Germany", "de", 2, 0, 1, 6, 6, true],
      ["Ivory Coast", "ci", 2, 0, 1, 2, 6, true],
      ["Ecuador", "ec", 1, 1, 1, 0, 4, true],
      ["Curaçao", "cw", 0, 1, 2, -8, 1, false],
    ],
  },
  {
    name: "Group F",
    rows: [
      ["Netherlands", "nl", 2, 1, 0, 6, 7, true],
      ["Japan", "jp", 1, 2, 0, 4, 5, true],
      ["Sweden", "se", 1, 1, 1, 0, 4, true],
      ["Tunisia", "tn", 0, 0, 3, -10, 0, false],
    ],
  },
  {
    name: "Group G",
    rows: [
      ["Belgium", "be", 1, 2, 0, 3, 5, true],
      ["Egypt", "eg", 1, 2, 0, 2, 5, true],
      ["Iran", "ir", 1, 0, 2, 0, 3, false],
      ["New Zealand", "nz", 0, 1, 2, -5, 1, false],
    ],
  },
  {
    name: "Group H",
    rows: [
      ["Spain", "es", 2, 1, 0, 5, 7, true],
      ["Cape Verde", "cv", 1, 0, 2, 0, 3, true],
      ["Uruguay", "uy", 0, 2, 1, -1, 2, false],
      ["Saudi Arabia", "sa", 0, 1, 2, -4, 1, false],
    ],
  },
  {
    name: "Group I",
    rows: [
      ["France", "fr", 3, 0, 0, 8, 9, true],
      ["Norway", "no", 2, 0, 1, 1, 6, true],
      ["Senegal", "sn", 1, 0, 2, -1, 3, true],
      ["Iraq", "iq", 0, 0, 3, -6, 0, false],
    ],
  },
  {
    name: "Group J",
    rows: [
      ["Argentina", "ar", 3, 0, 0, 7, 9, true],
      ["Austria", "at", 1, 1, 1, 0, 4, true],
      ["Algeria", "dz", 1, 1, 1, -2, 4, true],
      ["Jordan", "jo", 0, 0, 3, -5, 0, false],
    ],
  },
  {
    name: "Group K",
    rows: [
      ["Colombia", "co", 2, 0, 1, 3, 6, true],
      ["Portugal", "pt", 1, 1, 1, 5, 4, true],
      ["DR Congo", "cd", 1, 1, 1, 1, 4, true],
      ["Uzbekistan", "uz", 0, 0, 3, -7, 0, false],
    ],
  },
  {
    name: "Group L",
    rows: [
      ["England", "gb-eng", 2, 1, 0, 4, 7, true],
      ["Croatia", "hr", 2, 0, 1, 0, 6, true],
      ["Ghana", "gh", 1, 1, 1, 0, 4, true],
      ["Panama", "pa", 0, 0, 3, -4, 0, false],
    ],
  },
];

export function GroupTables() {
  return (
    <div aria-label="World Cup group standings" role="region">
      <div className="group-tables">
      {GROUPS.map((group, groupIndex) => (
        <div className={`gt-card gt-card-${groupIndex % 4}`} key={group.name}>
          <div className="gt-head">
            <div className="gt-title">{group.name}</div>
          </div>
          <table className="gt-table">
            <thead>
              <tr>
                <th className="gt-team-h">Team</th>
                <th title="Matches played">MP</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GD</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map(([name, iso, w, d, l, gd, pts, adv], index) => (
                <tr
                  className={adv ? (index >= 2 ? "gt-adv gt-third" : "gt-adv") : undefined}
                  key={name}
                >
                  <td className="gt-team">
                    <span className="gt-cell">
                      <span className="gt-pos">{index + 1}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt=""
                        className="gt-flag"
                        loading="lazy"
                        src={`https://flagcdn.com/w40/${iso}.png`}
                      />
                      <span className="gt-name">{name}</span>
                    </span>
                  </td>
                  <td className="gt-played">{w + d + l}</td>
                  <td>{w}</td>
                  <td className="gt-muted">{d}</td>
                  <td className="gt-muted">{l}</td>
                  <td className="gt-muted">{gd > 0 ? `+${gd}` : gd}</td>
                  <td className="gt-pts"><span>{pts}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      </div>
    </div>
  );
}
