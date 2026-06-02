const FALLBACK_PUBLIC_APP_URL = "https://rancho-seven.vercel.app";

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isLocalUrl(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(value);
}

export function getPublicAppUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured && !isLocalUrl(normalizeUrl(configured))) return normalizeUrl(configured);

  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (isLocalUrl(origin)) {
      return FALLBACK_PUBLIC_APP_URL;
    }
    return normalizeUrl(origin);
  }

  return FALLBACK_PUBLIC_APP_URL;
}

export function getPasswordResetRedirectUrl() {
  return `${getPublicAppUrl()}/redefinir-senha`;
}
