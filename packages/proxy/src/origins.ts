export type AllowedOrigin = string | RegExp;

const DEFAULT_ALLOWED_ORIGINS: AllowedOrigin[] = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  // Tailscale CGNAT range: 100.64.0.0/10 (second octet 64–127)
  /^https?:\/\/100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}(:\d+)?$/,
];

export function getAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env,
): AllowedOrigin[] {
  const allowedOrigins = [...DEFAULT_ALLOWED_ORIGINS];
  const configuredOrigins = env.PORTA_CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins?.length) {
    allowedOrigins.push(...configuredOrigins);
  }

  return allowedOrigins;
}

export function isAllowedOrigin(
  origin: string,
  allowedOrigins: AllowedOrigin[] = getAllowedOrigins(),
): boolean {
  for (const allowed of allowedOrigins) {
    if (typeof allowed === "string" && origin === allowed) {
      return true;
    }
    if (allowed instanceof RegExp && allowed.test(origin)) {
      return true;
    }
  }
  return false;
}

export function resolveCorsOrigin(
  origin: string | undefined,
  allowedOrigins: AllowedOrigin[] = getAllowedOrigins(),
): string | null | undefined {
  if (!origin) return origin;
  return isAllowedOrigin(origin, allowedOrigins) ? origin : null;
}
