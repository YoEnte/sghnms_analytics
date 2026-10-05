export function getSeasonRange(now = new Date()) {
  const year = Number(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      timeZone: "Europe/Berlin"
    }).format(now)
  );

  const month = Number(
    new Intl.DateTimeFormat("en-CA", {
      month: "2-digit",
      timeZone: "Europe/Berlin"
    }).format(now)
  );

  const seasonStartYear = month >= 7 ? year : year - 1;

  return {
    label: `${seasonStartYear}/${String(seasonStartYear + 1).slice(-2)}`,
    dateFrom: `${seasonStartYear}-09-01`,
    dateTo: `${seasonStartYear + 1}-06-30`
  };
}

export function handballDateParts(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);

  if (match) {
    const [, year, month, day, hour, minute] = match;
    const weekdayDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));

    return {
      date: `${year}-${month}-${day}`,
      dateText: `${day}.${month}.${year}`,
      time: `${hour}:${minute}`,
      weekday: new Intl.DateTimeFormat("de-DE", {
        weekday: "long",
        timeZone: "UTC"
      }).format(weekdayDate)
    };
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Unknown handball.net date format: ${raw}`);
  }

  return {
    date: new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Europe/Berlin"
    }).format(date),
    dateText: new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Europe/Berlin"
    }).format(date),
    time: new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/Berlin"
    }).format(date),
    weekday: new Intl.DateTimeFormat("de-DE", {
      weekday: "long",
      timeZone: "Europe/Berlin"
    }).format(date)
  };
}

export function normalizeMatch(raw) {
  const formatted = handballDateParts(raw.date);

  return {
    id: raw.id,
    datetime: raw.date,
    ...formatted,
    home: {
      id: raw.local?.id ?? null,
      name: raw.local?.name ?? "",
      clubId: raw.local?.club?.id ?? null
    },
    away: {
      id: raw.visitor?.id ?? null,
      name: raw.visitor?.name ?? "",
      clubId: raw.visitor?.club?.id ?? null
    },
    result: {
      home: raw.result?.local ?? null,
      away: raw.result?.visitor ?? null
    },
    status: {
      finished: Boolean(raw.status?.is_finished),
      live: Boolean(raw.status?.is_live)
    },
    venue: {
      name: raw.field?.name ?? "",
      address: raw.field?.installation?.address ?? ""
    },
    phase: {
      id: raw.phase?.id ?? null,
      name: raw.phase?.name ?? ""
    },
    competition: raw.phase?.competition?.name ?? ""
  };
}
