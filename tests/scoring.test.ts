import { describe, expect, it } from "vitest";
import { pointsForPosition, pointsFromMarks, rankTeams } from "@/lib/scoring";

describe("pointsForPosition", () => {
  it("awards 1 point for questions 1 through 5 and 3 for the bonus", () => {
    for (const position of [1, 2, 3, 4, 5]) {
      expect(pointsForPosition(position)).toBe(1);
    }
    expect(pointsForPosition(6)).toBe(3);
  });

  it("rejects positions outside the round", () => {
    expect(() => pointsForPosition(0)).toThrow(/1 through 6/);
    expect(() => pointsForPosition(7)).toThrow(/1 through 6/);
  });
});

describe("pointsFromMarks", () => {
  it("adds both directions and nothing for a miss", () => {
    expect(pointsFromMarks(1, true, true)).toBe(2);
    expect(pointsFromMarks(4, true, false)).toBe(1);
    expect(pointsFromMarks(5, false, false)).toBe(0);
    expect(pointsFromMarks(6, true, true)).toBe(6);
    expect(pointsFromMarks(6, false, true)).toBe(3);
  });
});

describe("rankTeams", () => {
  it("shares a competition rank and lists tied teams together", () => {
    const groups = rankTeams([
      { id: "c", name: "Cousins", points: 3 },
      { id: "b", name: "Kids", points: 5 },
      { id: "a", name: "Garcias", points: 5 },
      { id: "d", name: "Neighbors", points: 0 },
    ]);

    expect(groups).toEqual([
      {
        rank: 1,
        points: 5,
        teams: [
          { id: "a", name: "Garcias", points: 5 },
          { id: "b", name: "Kids", points: 5 },
        ],
      },
      { rank: 3, points: 3, teams: [{ id: "c", name: "Cousins", points: 3 }] },
      { rank: 4, points: 0, teams: [{ id: "d", name: "Neighbors", points: 0 }] },
    ]);
  });

  it("keeps a single shared rank when every team is tied", () => {
    const groups = rankTeams([
      { id: "b", name: "Beta", points: 0 },
      { id: "a", name: "Alpha", points: 0 },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rank).toBe(1);
    expect(groups[0].teams.map((team) => team.name)).toEqual(["Alpha", "Beta"]);
  });
});
