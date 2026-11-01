export type TeamScore = { id: string; name: string; points: number };

export type RankedGroup = {
  rank: number;
  points: number;
  teams: TeamScore[];
};

/** Questions 1–5 are worth 1 point per direction. Question 6 is worth 3. */
export function pointsForPosition(position: number): number {
  if (!Number.isInteger(position) || position < 1 || position > 6) {
    throw new Error(`Question position must be 1 through 6, got ${position}`);
  }
  return position === 6 ? 3 : 1;
}

/**
 * Rank teams from most points to least.
 * Tied teams share a competition rank and stay in one group.
 * The next rank skips (1, 1, 3). Within a tie, names are alphabetical.
 */
export function rankTeams(teams: TeamScore[]): RankedGroup[] {
  const sorted = [...teams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.name.localeCompare(b.name);
  });

  const groups: RankedGroup[] = [];
  sorted.forEach((team, index) => {
    const previous = groups[groups.length - 1];
    if (previous && previous.points === team.points) {
      previous.teams.push({ ...team });
      return;
    }
    groups.push({
      rank: index + 1,
      points: team.points,
      teams: [{ ...team }],
    });
  });
  return groups;
}

export function pointsFromMarks(
  position: number,
  aPredictsB: boolean,
  bPredictsA: boolean,
): number {
  const each = pointsForPosition(position);
  return (aPredictsB ? each : 0) + (bPredictsA ? each : 0);
}
