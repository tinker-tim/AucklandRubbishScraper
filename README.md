# Auckland Rubbish Scraper API

This project runs a weekly scheduled fetch from a webpage, converts the HTML into JSON using Cheerio, stores the result in SQLite, and exposes the stored data through a Fastify HTTP API.

## Features

- Weekly scheduled fetch on Wednesday mornings
- Native Fetch API in Node.js
- HTML parsing with Cheerio
- SQLite persistence
- Fastify HTTP endpoints
- Docker-ready container

## Configuration

Environment variables:

- `FETCH_ID` - page ID to fetch from Auckland Council (builds the URL automatically)
- `FETCH_URL` - full URL to fetch; overrides `FETCH_ID` if set
- `FETCH_CRON` - cron expression for scheduling (default: `0 4 * * 3`)
- `SCHEDULER_TIMEZONE` - scheduler timezone (default: `UTC`)
- `DATABASE_FILE` - SQLite file path (default: `data/data.db`)
- `PORT` - API port (default: `8000`)
- `HOST` - bind host for the app itself (inside Docker, usually `0.0.0.0`)
- `FETCH_TOKEN` - optional bearer token required for `POST /fetch`

Example:

```bash
FETCH_ID=12341661815 PORT=8000 FETCH_TOKEN=change-me npm start
```

> For a home-network Docker deployment, bind the app to `0.0.0.0` inside the container and only publish the port on a trusted private interface. Do not expose the container to the public internet unless you specifically want that.

This will fetch the configured council collection page for the selected site ID.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Build the project:

```bash
npm run build
```

3. Start the app:

```bash
npm start
```

4. Open Postman or browser at:

- http://localhost:8000/health

### Quick health check script

After the app is running you can run the small cross-platform health check script:

```bash
npm run health-check
```

You can customize the host/port/path with env vars:

```bash
HEALTH_HOST=localhost HEALTH_PORT=8000 HEALTH_PATH=/health npm run health-check
```

## Run with Docker

```bash
docker build -t rubbish-scraper-api .

docker run -p 8000:8000 rubbish-scraper-api
```

Or use Docker Compose:

```bash
docker compose up --build
```

## API Endpoints

- `GET /health` - health check
- `GET /data/latest` - latest stored fetch result
- `GET /data/history?limit=10` - last N stored results
- `GET /data/{item_id}` - fetch a stored result by id
- `POST /fetch` - trigger a scrape manually; requires `Authorization: Bearer <FETCH_TOKEN>` when `FETCH_TOKEN` is configured

## Security notes

- The service is intended for private-network use and should not be exposed directly to the public internet.
- `POST /fetch` is protected with an optional bearer token to avoid unauthorised triggering.
- The fetch URL is restricted to the Auckland Council host over HTTPS to reduce SSRF risk.
- Keep `.env` local and never commit secrets to the repository.
