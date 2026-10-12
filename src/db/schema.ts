import {
  pgTable,
  uuid,
  text,
  timestamp,
  doublePrecision,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/** A single GPS sample aggregated once per second on the client. */
export type TripSample = {
  t: number; // ms since trip start
  lat: number;
  lng: number;
  speed: number; // km/h
  g: number; // total lateral/longitudinal g at that second
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull(),
  country: text("country").notNull().default("Global"),
  car: text("car"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").notNull().default("sports"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    durationSec: integer("duration_sec").notNull(),
    distanceKm: doublePrecision("distance_km").notNull(),
    topSpeedKmh: doublePrecision("top_speed_kmh").notNull(),
    avgSpeedKmh: doublePrecision("avg_speed_kmh").notNull(),
    maxGForce: doublePrecision("max_gforce").notNull(),
    zeroToHundredSec: doublePrecision("zero_to_hundred_sec"),
    zeroToSixtySec: doublePrecision("zero_to_sixty_sec"),
    speedArray: jsonb("speed_array").$type<number[]>().notNull(),
    samples: jsonb("samples").$type<TripSample[]>().notNull(),
    isSimulated: integer("is_simulated").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trips_user_idx").on(t.userId),
    index("trips_top_speed_idx").on(t.topSpeedKmh),
    index("trips_mode_top_speed_idx").on(t.mode, t.topSpeedKmh),
  ]
);

export const videoRenders = pgTable("video_renders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("processing"), // processing | done | failed
  outputPath: text("output_path"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Trip = typeof trips.$inferSelect;
