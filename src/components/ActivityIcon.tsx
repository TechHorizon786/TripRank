import type { TripMode } from "@/lib/modes";

export default function ActivityIcon({ mode, className = "" }: { mode: TripMode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {mode === "sports" && (
        <>
          <path d="M4 17a8 8 0 1 1 16 0" />
          <path d="m12 13 4-4M7 17h10" />
          <path d="M8 5 6 3m10 2 2-2" />
        </>
      )}
      {mode === "walking" && (
        <>
          <circle cx="14.5" cy="4.5" r="2" />
          <path d="m12.5 9 2.5 2 3 .5M13 9l-2 4 3 2 1 5M11 13l-4 2-2 4m8-10 3-2 2 1" />
        </>
      )}
      {mode === "cycling" && (
        <>
          <circle cx="5.5" cy="17" r="3.5" />
          <circle cx="18.5" cy="17" r="3.5" />
          <path d="m5.5 17 4-7h4l5 7h-7l-2-7m4 0h3" />
          <circle cx="12.5" cy="5" r="1.5" />
        </>
      )}
      {mode === "bike" && (
        <>
          <circle cx="6" cy="17" r="3" />
          <circle cx="19" cy="17" r="3" />
          <path d="m6 17 3-6h5l3 2 2 4m-9-6 2-3h4l2 3m-7 0-2 3h6" />
          <path d="M12 8h3" />
        </>
      )}
      {mode === "car" && (
        <>
          <path d="m3 15 1.5-5A2 2 0 0 1 6.4 8.5h11.2a2 2 0 0 1 1.9 1.5l1.5 5v4h-3v-2H6v2H3z" />
          <path d="M4 14h16M7 11h10" />
          <circle cx="7" cy="16" r=".8" fill="currentColor" stroke="none" />
          <circle cx="17" cy="16" r=".8" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
