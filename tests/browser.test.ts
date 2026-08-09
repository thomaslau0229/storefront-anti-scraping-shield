import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

import { generateBrowserScript } from "../src/browser";
import { validConfig } from "./fixtures/config";

type Listener = (event: { isTrusted?: boolean; persisted?: boolean }) => void;

function harness(
  pathname = "/protected",
  response: unknown = { action: "allow" },
  origin = "https://site.example",
) {
  const listeners = new Map<string, Listener[]>();
  const documentListeners = new Map<string, Listener[]>();
  const timers: Array<() => void> = [];
  const stored = new Map<string, string>();
  const replace = vi.fn();
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    void init;
    return { json: async () => response };
  });

  function add(target: Map<string, Listener[]>, type: string, listener: Listener) {
    target.set(type, [...(target.get(type) ?? []), listener]);
  }

  const context = {
    URL,
    Date,
    Math,
    Uint8Array,
    crypto: {
      getRandomValues(values: Uint8Array) {
        values.forEach((_, index) => {
          values[index] = index + 1;
        });
        return values;
      },
    },
    navigator: { webdriver: true },
    location: {
      href: `${origin}${pathname}`,
      origin,
      pathname,
      replace,
    },
    sessionStorage: {
      getItem(key: string) {
        return stored.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        stored.set(key, value);
      },
    },
    document: {
      addEventListener(type: string, listener: Listener) {
        add(documentListeners, type, listener);
      },
    },
    addEventListener(type: string, listener: Listener) {
      add(listeners, type, listener);
    },
    setTimeout(callback: () => void) {
      timers.push(callback);
      return timers.length;
    },
    fetch,
  };

  vm.runInNewContext(generateBrowserScript(validConfig(), "https://worker.example"), context);

  return {
    fetch,
    replace,
    timers,
    dispatch(type: string, event: Parameters<Listener>[0], document = false) {
      for (const listener of (document ? documentListeners : listeners).get(type) ?? []) {
        listener(event);
      }
    },
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("browser runtime", () => {
  it.each(["/safe", "/excluded", "/unprotected"])("does not run on %s", (pathname) => {
    const state = harness(pathname);

    expect(state.timers).toHaveLength(0);
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("does not run on the configured destination", () => {
    const state = harness("/safe", { action: "allow" }, "https://destination.example");

    expect(state.timers).toHaveLength(0);
  });

  it("counts only trusted allowed interaction events", async () => {
    const state = harness();
    for (const type of ["pointerdown", "touchstart", "keydown", "scroll"]) {
      state.dispatch(type, { isTrusted: false });
      state.dispatch(type, { isTrusted: true });
    }
    state.dispatch("visibilitychange", { isTrusted: false }, true);
    state.dispatch("visibilitychange", { isTrusted: true }, true);

    state.timers[0]?.();
    await settle();

    const init = state.fetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.trustedInteractions).toBe(5);
    expect(Object.keys(body).sort()).toEqual(
      [
        "campaignSeed",
        "cohortSeed",
        "dwellMs",
        "path",
        "trustedInteractions",
        "visitorSeed",
        "webdriver",
      ].sort(),
    );
  });

  it("uses location.replace only for an exact redirect decision and destination", async () => {
    const state = harness("/protected", {
      action: "redirect",
      redirectUrl: "https://destination.example/safe",
    });

    state.timers[0]?.();
    await settle();

    expect(state.replace).toHaveBeenCalledOnce();
    expect(state.replace).toHaveBeenCalledWith("https://destination.example/safe");
  });

  it.each([
    { action: "allow", redirectUrl: "https://destination.example/safe" },
    { action: "redirect", redirectUrl: "https://destination.example/excluded" },
  ])("ignores non-exact redirect response %#", async (response) => {
    const state = harness("/protected", response);
    state.timers[0]?.();
    await settle();

    expect(state.replace).not.toHaveBeenCalled();
  });

  it("sends a keepalive check on pagehide", async () => {
    const state = harness();
    state.dispatch("pagehide", {});
    await settle();

    expect(state.fetch).toHaveBeenCalledOnce();
    expect(state.fetch.mock.calls[0]?.[1]).toMatchObject({ keepalive: true });
  });

  it("rechecks a bfcache-restored protected page", async () => {
    const state = harness();
    state.dispatch("pageshow", { persisted: false });
    state.dispatch("pageshow", { persisted: true });
    await settle();

    expect(state.fetch).toHaveBeenCalledOnce();
  });

  it("sends keepalive again after a bfcache restore starts a new page lifecycle", async () => {
    const state = harness();
    state.dispatch("pagehide", {});
    await settle();
    state.dispatch("pageshow", { persisted: true });
    await settle();
    state.dispatch("pagehide", {});
    await settle();

    expect(state.fetch).toHaveBeenCalledTimes(3);
    expect(state.fetch.mock.calls[0]?.[1]).toMatchObject({ keepalive: true });
    expect(state.fetch.mock.calls[1]?.[1]).toMatchObject({ keepalive: false });
    expect(state.fetch.mock.calls[2]?.[1]).toMatchObject({ keepalive: true });
  });

  it("fails open on a network error", async () => {
    const state = harness();
    state.fetch.mockRejectedValueOnce(new Error("offline"));
    state.timers[0]?.();
    await settle();

    expect(state.replace).not.toHaveBeenCalled();
  });
});
