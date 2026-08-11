import * as cheerio from "cheerio";
import { saveResult } from "./database.js";

const ALLOWED_FETCH_HOSTS = new Set(["www.aucklandcouncil.govt.nz"]);
const FETCH_ID = process.env.FETCH_ID;
const FETCH_URL =
  process.env.FETCH_URL ??
  (FETCH_ID
    ? `https://www.aucklandcouncil.govt.nz/en/rubbish-recycling/rubbish-recycling-collections/rubbish-recycling-collection-days/${FETCH_ID}.html`
    : undefined);

if (!FETCH_URL) {
  throw new Error(
    "Missing FETCH_URL or FETCH_ID environment variable. Set FETCH_ID to the numeric page ID."
  );
}

function getValidatedFetchUrl(): string {
  const source = FETCH_URL;

  if (!source) {
    throw new Error("Missing FETCH_URL or FETCH_ID environment variable.");
  }

  let url: URL;

  try {
    url = new URL(source);
  } catch {
    throw new Error(`Invalid FETCH_URL value: ${source}`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`FETCH_URL must use HTTPS: ${source}`);
  }

  if (!ALLOWED_FETCH_HOSTS.has(url.hostname)) {
    throw new Error(`FETCH_URL host is not allowed: ${url.hostname}`);
  }

  return url.toString();
}

// Parse date from text (e.g., "Tuesday, 18 August" → "2026-08-18")
function parseDate(text: string): string | null {
  if (!text) return null;
  
  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };
  
  // Try to extract "18 August" or "18 August 2026" pattern (with or without year and day name)
  const dateMatch = text.match(/(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?/);
  if (dateMatch) {
    const [, day, month, yearStr] = dateMatch;
    const monthNum = months[month.toLowerCase()];
    if (monthNum) {
      // Use provided year or infer from current date
      const year = yearStr ? Number(yearStr) : new Date().getFullYear();
      // Format directly to avoid timezone issues
      const dayPad = String(day).padStart(2, '0');
      const monthPad = String(monthNum).padStart(2, '0');
      return `${year}-${monthPad}-${dayPad}`;
    }
  }
  
  // Fallback: try ISO format
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[0];
  }
  return null;
}


interface CollectionData {
  rubbish: { date: string | null };
  food_scraps: { date: string | null };
  recycling: { date: string | null };
}

interface FetchedData {
  source: string;
  collections: CollectionData;
}

function htmlToJson(html: string): FetchedData {
  const $ = cheerio.load(html);

  // Look for the three lines with class "mb-0 lead"
  const lines = $(".mb-0.lead")
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);

  const stripPrefix = (s: string) => s.replace(/^[^:–-]*[:–-]\s*/u, "").trim();
  const stripped = lines.map((l) => stripPrefix(l));

  if (lines.length >= 1) {
    const data: FetchedData = {
      source: "Auckland Council",
      collections: {
        rubbish: { date: parseDate(stripped[0] ?? "") },
        food_scraps: { date: parseDate(stripped[1] ?? "") },
        recycling: { date: parseDate(stripped[2] ?? "") },
      },
    };
    return data;
  }

  // fallback to simple text
  return {
    source: "Auckland Council",
    collections: {
      rubbish: { date: null },
      food_scraps: { date: null },
      recycling: { date: null },
    },
  };
}

export async function fetchAndStore(dbPath: string): Promise<{ id: number; data: FetchedData }> {
  const url = getValidatedFetchUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AucklandRubbishScraper/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    const html = await response.text();
    const data = htmlToJson(html);
    const id = await saveResult(dbPath, url, data);
    return { id, data };
  } finally {
    clearTimeout(timeout);
  }
}

