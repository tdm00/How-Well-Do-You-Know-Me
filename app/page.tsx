import Link from "next/link";
import { Logo } from "@/components/logo";

const doors = [
  {
    href: "/host",
    title: "Host",
    copy: "Create the room, pair people up, and judge the close calls.",
    testId: "door-host",
  },
  {
    href: "/play",
    title: "Phone",
    copy: "Join with the room code, type your answer, and lock it.",
    testId: "door-play",
  },
  {
    href: "/tv",
    title: "TV",
    copy: "Leave this on the big screen. Standings stay up the whole game.",
    testId: "door-tv",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-10 px-6 py-12">
      <Logo markClassName="h-20 w-20" />
      <div className="max-w-2xl">
        <p className="font-display text-4xl leading-tight text-ink sm:text-5xl">
          Phones for answers. The TV for the laughs.
        </p>
        <p className="mt-4 max-w-xl text-xl leading-relaxed text-ink/80">
          Two rounds, six questions each. You write what you would say, and what you think your
          partner will say. The host decides what counts as a match.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {doors.map((door) => (
          <Link
            key={door.href}
            href={door.href}
            data-testid={door.testId}
            className="flex min-h-36 flex-col justify-between rounded-card border border-line bg-cream p-5 shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          >
            <span className="font-display text-3xl">{door.title}</span>
            <span className="mt-3 text-lg leading-snug text-ink/80">{door.copy}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
