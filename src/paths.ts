import { MAX_PATH_LENGTH, type AppConfig, type RouteClass } from "./types";

const LOCALE_SEGMENT = /^[a-z]{2}(?:-[a-z]{2})?$/i;

export function normalizePathname(pathname: string): string {
  const path = pathname.trim();
  if (path.length > MAX_PATH_LENGTH || !path.startsWith("/") || path.includes("?") || path.includes("#")) {
    throw new Error("CONFIG_PATH_INVALID");
  }

  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

export function stripLeadingLocale(pathname: string): string {
  const path = normalizePathname(pathname);
  const segments = path.split("/");
  const firstSegment = segments[1];

  if (!firstSegment || !LOCALE_SEGMENT.test(firstSegment)) {
    return path;
  }

  const withoutLocale = `/${segments.slice(2).join("/")}`;
  return withoutLocale === "/" ? withoutLocale : normalizePathname(withoutLocale);
}

export function matchesPathPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function classifyPath(pathname: string, config: AppConfig): RouteClass {
  const normalizedPath = stripLeadingLocale(pathname);

  if (matchesPathPrefix(normalizedPath, config.excludedPaths)) {
    return "excluded";
  }

  if (matchesPathPrefix(normalizedPath, config.protectedPaths)) {
    return "protected";
  }

  return "unprotected";
}
