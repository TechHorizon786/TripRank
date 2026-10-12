export const TRIP_MODES = ["sports", "walking", "cycling", "bike", "car"] as const;

export type TripMode = (typeof TRIP_MODES)[number];

export const TRIP_MODE_DETAILS: Record<
  TripMode,
  { label: string; icon: string; description: string; speedBands: [number, number, number] }
> = {
  sports: {
    label: "Sports",
    icon: "🏁",
    description: "Performance stats · track use only",
    speedBands: [0, 0, 0],
  },
  walking: {
    label: "Walking",
    icon: "🚶",
    description: "Track a walk",
    speedBands: [2, 4, 6],
  },
  cycling: {
    label: "Cycling",
    icon: "🚴",
    description: "Track a cycle",
    speedBands: [8, 15, 25],
  },
  bike: {
    label: "Bike",
    icon: "🏍️",
    description: "Track a motorcycle ride",
    speedBands: [30, 60, 90],
  },
  car: {
    label: "Car",
    icon: "🚘",
    description: "Track a car drive",
    speedBands: [30, 60, 90],
  },
};

const PACE_LABELS: Record<Exclude<TripMode, "sports">, [string, string, string, string]> = {
  walking: ["Slow", "Steady", "Brisk", "Fast"],
  cycling: ["Easy", "Steady", "Brisk", "Fast"],
  bike: ["Low", "Moderate", "High", "Very high"],
  car: ["Low", "Moderate", "High", "Very high"],
};

export function isTripMode(value: unknown): value is TripMode {
  return typeof value === "string" && TRIP_MODES.includes(value as TripMode);
}

export function paceLabel(mode: TripMode, speedKmh: number): string | null {
  if (mode === "sports") return null;
  const [first, second, third] = TRIP_MODE_DETAILS[mode].speedBands;
  const labels = PACE_LABELS[mode];
  if (speedKmh < first) return labels[0];
  if (speedKmh < second) return labels[1];
  if (speedKmh < third) return labels[2];
  return labels[3];
}

export function paceBandLabels(mode: Exclude<TripMode, "sports">): [string, string, string, string] {
  return PACE_LABELS[mode];
}
