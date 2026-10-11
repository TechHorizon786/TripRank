"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    href: "/",
    label: "Drive",
    icon: (
      <path d="M12 3a9 9 0 1 0 9 9M12 12l5-5M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0" />
    ),
  },
  {
    href: "/leaderboard",
    label: "Ranks",
    icon: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />,
  },
  {
    href: "/garage",
    label: "Garage",
    icon: <path d="M3 12l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v5h-3v-2H6v2H3zM3 12h18M7 15h.01M17 15h.01" />,
  },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-white/5 bg-ink/90 px-6 pt-2 backdrop-blur-xl">
      <ul className="flex items-center justify-around">
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={`flex flex-col items-center gap-1 px-4 py-1 text-[11px] font-medium transition ${
                  active ? "text-neon" : "text-muted hover:text-white"
                }`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {it.icon}
                </svg>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
