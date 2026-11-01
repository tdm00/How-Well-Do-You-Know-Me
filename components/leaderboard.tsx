import { ScoreValue } from "@/components/score-value";
import type { LeaderboardGroup } from "@/lib/types";

export function Leaderboard({
  groups,
  tone = "tv",
}: {
  groups: LeaderboardGroup[];
  tone?: "tv" | "paper";
}) {
  const onTv = tone === "tv";
  return (
    <section
      aria-label="Standings"
      data-testid="leaderboard"
      className={onTv ? "flex h-full flex-col" : "flex flex-col"}
    >
      <h2
        className={
          onTv
            ? "font-display text-[clamp(2rem,3vw,4rem)] leading-none text-gold-bright"
            : "font-display text-3xl text-ink"
        }
      >
        Standings
      </h2>
      <ol className={onTv ? "mt-6 flex flex-1 flex-col gap-4" : "mt-4 flex flex-col gap-3"}>
        {groups.length === 0 ? (
          <li className={onTv ? "text-[clamp(1.5rem,2vw,2.4rem)] text-cream/80" : "text-lg text-miss"}>
            Teams show up here.
          </li>
        ) : (
          groups.map((group) => (
            <li key={`${group.rank}-${group.points}`} className="flex items-stretch gap-4">
              <div
                className={
                  onTv
                    ? "flex w-[clamp(3.5rem,5vw,6rem)] items-center justify-center rounded-2xl bg-gold font-display text-[clamp(2rem,3vw,3.5rem)] text-ink"
                    : "flex w-12 items-center justify-center rounded-xl bg-gold font-display text-2xl text-ink"
                }
              >
                {group.rank}
              </div>
              <div
                className={
                  onTv
                    ? "flex flex-1 flex-col justify-center rounded-2xl bg-tvcard px-5 py-3"
                    : "flex flex-1 flex-col justify-center rounded-2xl bg-paper px-4 py-2"
                }
              >
                {group.teams.map((team) => (
                  <div key={team.id} className="flex items-baseline justify-between gap-4">
                    <span
                      className={
                        onTv
                          ? "font-display text-[clamp(1.7rem,2.4vw,3.2rem)] leading-tight"
                          : "font-display text-2xl"
                      }
                    >
                      {team.name}
                    </span>
                    <span
                      className={
                        onTv
                          ? "font-display text-[clamp(2.2rem,3.4vw,4.5rem)] leading-none text-gold-bright"
                          : "font-display text-3xl text-terracotta-dark"
                      }
                    >
                      <ScoreValue value={team.points} testId={`score-${team.name}`} />
                    </span>
                  </div>
                ))}
              </div>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
