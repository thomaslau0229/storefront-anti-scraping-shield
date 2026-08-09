import type { AppConfig } from "./types";

interface BrowserRuntimeOptions {
  workerOrigin: string;
  redirectUrl: string;
  protectedPaths: readonly string[];
  excludedPaths: readonly string[];
}

interface SessionMaterial {
  visitorSeed: string;
  campaignSeed: string;
  cohortSeed: string;
}

export function generateBrowserScript(config: AppConfig, workerOrigin: string): string {
  const options: BrowserRuntimeOptions = {
    workerOrigin,
    redirectUrl: config.redirectUrl.href,
    protectedPaths: config.protectedPaths,
    excludedPaths: config.excludedPaths,
  };
  return `(${runBrowserRuntime.toString()})(${JSON.stringify(options)});`;
}

function runBrowserRuntime(options: BrowserRuntimeOptions): void {
  try {
    const destination = new URL(options.redirectUrl);
    const normalize = (pathname: string): string =>
      pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    const stripLocale = (pathname: string): string => {
      const normalized = normalize(pathname);
      const segments = normalized.split("/");
      if (!/^[a-z]{2}(?:-[a-z]{2})?$/i.test(segments[1] ?? "")) {
        return normalized;
      }
      return normalize(`/${segments.slice(2).join("/")}`);
    };
    const matches = (pathname: string, prefixes: readonly string[]): boolean =>
      prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    const isProtected = (pathname: string): boolean => {
      const normalized = stripLocale(pathname);
      return !matches(normalized, options.excludedPaths) && matches(normalized, options.protectedPaths);
    };
    const isDestination = (): boolean =>
      location.origin === destination.origin &&
      normalize(location.pathname) === normalize(destination.pathname);

    if (isDestination() || !isProtected(location.pathname)) {
      return;
    }

    const sessionKey = "shield.session.v1";
    const randomSeed = (): string => {
      const bytes = crypto.getRandomValues(new Uint8Array(18));
      return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    };
    const isSessionMaterial = (value: unknown): value is SessionMaterial => {
      if (!value || typeof value !== "object") {
        return false;
      }
      const record = value as Record<string, unknown>;
      return [record.visitorSeed, record.campaignSeed, record.cohortSeed].every(
        (seed) => typeof seed === "string" && seed.length > 0 && seed.length <= 64,
      );
    };

    let material: SessionMaterial;
    const stored = sessionStorage.getItem(sessionKey);
    const parsed = stored ? (JSON.parse(stored) as unknown) : undefined;
    if (isSessionMaterial(parsed)) {
      material = parsed;
    } else {
      material = {
        visitorSeed: `v-${randomSeed()}`,
        campaignSeed: `c-${randomSeed()}`,
        cohortSeed: `o-${randomSeed()}`,
      };
      sessionStorage.setItem(sessionKey, JSON.stringify(material));
    }

    const startedAt = Date.now();
    let trustedInteractions = 0;
    const countTrusted = (event: Event): void => {
      if (event.isTrusted === true) {
        trustedInteractions = Math.min(100, trustedInteractions + 1);
      }
    };
    for (const type of ["pointerdown", "touchstart", "keydown", "scroll"]) {
      globalThis.addEventListener(type, countTrusted, { passive: true });
    }
    document.addEventListener("visibilitychange", countTrusted, { passive: true });

    const send = async (keepalive: boolean): Promise<void> => {
      try {
        const response = await fetch(`${options.workerOrigin}/v1/check`, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          keepalive,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: location.pathname,
            ...material,
            trustedInteractions,
            dwellMs: Math.min(300_000, Math.max(0, Date.now() - startedAt)),
            webdriver: navigator.webdriver === true,
          }),
        });
        const decision = (await response.json()) as unknown;
        if (
          decision !== null &&
          typeof decision === "object" &&
          (decision as Record<string, unknown>).action === "redirect" &&
          (decision as Record<string, unknown>).redirectUrl === options.redirectUrl
        ) {
          location.replace(options.redirectUrl);
        }
      } catch {
        // Network and response failures leave the current page untouched.
      }
    };

    setTimeout(() => void send(false), 1_200);
    let pagehideSent = false;
    globalThis.addEventListener("pagehide", () => {
      if (!pagehideSent) {
        pagehideSent = true;
        void send(true);
      }
    });
    globalThis.addEventListener("pageshow", (event: PageTransitionEvent) => {
      if (event.persisted && isProtected(location.pathname) && !isDestination()) {
        pagehideSent = false;
        void send(false);
      }
    });
  } catch {
    // Runtime failures must not block rendering or navigation.
  }
}
