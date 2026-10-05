import { CLUB_ID, HANDBALL_BASE } from "../config/config.js";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/151.0.0.0 Safari/537.36";

let cachedClientToken = null;

export class HandballHttpError extends Error {
  constructor(message, { status = null, body = null } = {}) {
    super(message);
    this.name = "HandballHttpError";
    this.status = status;
    this.body = body;
  }
}

function clientTokenIsValid(token) {
  if (!token) return false;
  const expiry = Number(token.split(".")[0]);
  return Number.isFinite(expiry) && Date.now() < expiry - 60_000;
}

async function getClientToken(forceRefresh = false) {
  if (!forceRefresh && clientTokenIsValid(cachedClientToken)) {
    return cachedClientToken;
  }

  const response = await fetch(`${HANDBALL_BASE}/club/${CLUB_ID}`, {
    headers: {
      Accept: "text/html",
      "User-Agent": BROWSER_USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Club page returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const metaTag = html.match(/<meta\b[^>]*name=["']client-token["'][^>]*>/i)?.[0];
  const token = metaTag?.match(/\bcontent=["']([^"']+)["']/i)?.[1];

  if (!token) {
    throw new Error("client-token could not be found");
  }

  cachedClientToken = token;
  return token;
}

async function fetchJson(url, { retry = true } = {}) {
  const token = await getClientToken();

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Referer: `${HANDBALL_BASE}/club/${CLUB_ID}`,
      "X-Client-Token": token,
      "User-Agent": BROWSER_USER_AGENT
    }
  });

  if (response.ok) {
    return response.json();
  }

  const body = await response.text();
  let parsed = null;

  try {
    parsed = JSON.parse(body);
  } catch {
    // Keep plain response text for error reporting.
  }

  if (retry && response.status === 403 && parsed?.code === "CLIENT_TOKEN_EXPIRED") {
    cachedClientToken = null;
    await getClientToken(true);
    return fetchJson(url, { retry: false });
  }

  throw new HandballHttpError(`handball.net returned HTTP ${response.status}: ${body.slice(0, 300)}`, {
    status: response.status,
    body
  });
}

export async function fetchClubMatchesPage({ dateFrom, dateTo, page = 1, perPage = 100 }) {
  const params = new URLSearchParams({
    club_id: CLUB_ID,
    per_page: String(perPage),
    page: String(page),
    date_from: dateFrom,
    date_to: dateTo
  });

  return fetchJson(`${HANDBALL_BASE}/api/new/matches?${params}`);
}

export async function fetchMatchEvents(matchId) {
  return fetchJson(`${HANDBALL_BASE}/api/new/matches/${encodeURIComponent(matchId)}/events`);
}

export async function fetchMatchLineups(matchId) {
  return fetchJson(`${HANDBALL_BASE}/api/new/matches/${encodeURIComponent(matchId)}/lineups`);
}
