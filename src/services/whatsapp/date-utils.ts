function dateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function dateFromReference(reference?: string) {
  const date = new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(reference || ""))) {
    const parsed = new Date(`${reference}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (reference === "anteontem") date.setDate(date.getDate() - 2);
  if (reference === "ontem") date.setDate(date.getDate() - 1);
  if (reference === "amanha") date.setDate(date.getDate() + 1);
  return date;
}



export function dateOnlyFromReference(reference?: string) {
  return dateOnly(dateFromReference(reference));
}



export function isoFromReference(reference?: string, time?: string) {
  const date = dateFromReference(reference);
  if (time) {
    const [hour, minute] = time.split(":").map(Number);
    date.setHours(hour || 0, minute || 0, 0, 0);
  }
  return date.toISOString();
}

