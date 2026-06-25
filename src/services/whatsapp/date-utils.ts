import {
  getRanchTodayISO,
  parseUserDateToRanchDate,
  ranchDateToInstant,
  resolveDefaultEventDate
} from "@/lib/dates/ranch-time";

export function dateFromReference(reference?: string) {
  return ranchDateToInstant(reference || getRanchTodayISO());
}



export function dateOnlyFromReference(reference?: string) {
  return resolveDefaultEventDate(reference);
}



export function isoFromReference(reference?: string, time?: string) {
  const date = parseUserDateToRanchDate(reference) || getRanchTodayISO();
  return ranchDateToInstant(date, time).toISOString();
}
