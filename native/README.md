# TripRank — Architecture

This repo ships two layers:

1. **A runnable web build** (Next.js App Router + Drizzle/PostgreSQL + optional Redis + FFmpeg). It's a mobile-first PWA that uses the browser Geolocation and DeviceMotion APIs, so it works on iOS/Android phones today.
2. **Native reference code** (`native/`) for the Expo + Express split, using the same algorithms and data model.

```
.
├── src/                              # ▶ Runnable web build
│   ├── app/
│   │   ├── page.tsx                  # Drive screen: START TRIP, speed dial, G-bubble
│   │   ├── trip/[id]/page.tsx        # Trip summary (shareable card, chart, map, video)
│   │   ├── leaderboard/page.tsx      # Global / country top 50
│   │   ├── garage/page.tsx           # Profile + trip history
│   │   └── api/
│   │       ├── trips/save/route.ts   # POST  /api/trips/save
│   │       ├── trips/[id]/route.ts   # GET   /api/trips/:id
│   │       ├── leaderboard/route.ts  # GET   /api/leaderboard?country=
│   │       ├── users/…               # POST  /api/users, GET /api/users/:id
│   │       └── video/…               # POST  /api/video/overlay, GET /api/video/:id(/file)
│   ├── components/                   # SpeedDial, GForceBubble, SpeedChart, RouteMap, TripSummary, VideoOverlay
│   ├── db/schema.ts                  # Drizzle schema (users, trips, video_renders)
│   └── lib/
│       ├── client/useTripTracker.ts  # GPS + motion → 1 Hz aggregator (+ demo simulator)
│       ├── leaderboard.ts            # Redis ZSET leaderboard w/ Postgres fallback
│       ├── metrics.ts                # haversine, 0-60/0-100 detection, units, speed buckets
│       └── video.ts                  # FFmpeg filtergraph (9:16 Reels overlay)
├── native/
│   ├── mobile/src/hooks/useTripTracker.ts     # expo-location + expo-sensors
│   ├── mobile/src/screens/TrackingScreen.tsx  # NativeWind tracking screen
│   └── server/src/
│       ├── app.ts                             # Express routes
│       ├── controllers/leaderboard.controller.ts
│       └── db/schema.sql
└── scripts/seed.mjs                  # demo drivers + an autobahn run
```

## Leaderboard
* `ZADD lb:top_speed:global GT <kmh> <user_id>`: `GT` only ever *raises* a driver's personal best.
* `ZREVRANGEBYSCORE key +inf -inf WITHSCORES LIMIT 0 50` returns the top 50.
* A trip's rank is `ZCOUNT key (score +inf` + 1.
* Set `REDIS_URL` to enable Redis. Without it, the web build uses equivalent SQL. If Redis is empty after a restart or flush, it's rebuilt from Postgres.

## Anti-cheat basics
The server recomputes top and average speed and the 0-100 time from the raw `speed_array`. It rejects speeds above 500 km/h and any mismatched `top_speed`, and it flags demo trips with `is_simulated`.

## Video overlay
The video is scaled and cropped to 1080×1920. Drawn on top: the TripRank wordmark, a live speed counter synced to the trip's speed data, a semi-transparent stats card, and the rank line. It's encoded as H.264 with `+faststart`, ready for Reels or TikTok.
