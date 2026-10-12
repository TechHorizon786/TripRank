# TripRank

TripRank is a GPS trip tracker built with Next.js, PostgreSQL, and Drizzle ORM. It supports Sports, Walking, Cycling, Bike, and Car trip modes. Sports keeps the top-speed leaderboard; the other modes show activity-specific pace bands without ranking riders against one another. Vehicle pace bands are general references, not road-speed guidance.

## Run locally

1. Use Node.js 20.9 or newer and install dependencies:

   ```bash
   npm install
   ```

2. Create a PostgreSQL database and add its connection URL to `.env`:

   ```env
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
   ```

3. Create the schema and optional demo data:

   ```bash
   npm run setup
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

## Deploy to Render

The included `render.yaml` defines a free Node web service. It requires an existing PostgreSQL connection URL and runs `drizzle-kit push` at service startup before starting Next.js.

1. Create a PostgreSQL database with a provider such as Neon. Keep its connection URL private.
2. In Render, choose **New → Blueprint**, connect `TechHorizon786/TripRank`, and deploy the Blueprint from `render.yaml`.
3. When prompted, provide the PostgreSQL connection URL as `DATABASE_URL`. Do not commit it to GitHub.
4. Open the generated HTTPS URL. Render redeploys automatically when changes are pushed to `main`.

Render's free web service can sleep while idle, and its filesystem is temporary. Video renders stored on disk won't persist after a restart; use persistent hosting/storage for long-term video hosting. For continuous availability and production use, select paid plans only after reviewing their costs.

## Install on a phone

Open the deployed HTTPS URL on the phone, allow location access, then choose **Add to Home Screen** (iPhone Safari) or **Install app / Add to Home screen** (Android Chrome). The site includes a web app manifest and icon. The local `http://localhost` URL works only on the computer running the app; GPS and motion permissions on a phone require a secure HTTPS origin.
