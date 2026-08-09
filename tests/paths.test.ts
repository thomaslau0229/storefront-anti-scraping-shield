import { describe, expect, it } from "vitest";

import { classifyPath } from "../src/paths";
import { validConfig } from "./fixtures/config";

describe("classifyPath", () => {
  it("classifies locale-prefixed protected routes as protected", () => {
    expect(classifyPath("/fr/protected/example", validConfig())).toBe("protected");
  });

  it("keeps the excluded route excluded", () => {
    expect(classifyPath("/excluded", validConfig())).toBe("excluded");
  });

  it("does not match a longer path segment with a protected prefix", () => {
    expect(classifyPath("/protected-extra", validConfig())).toBe("unprotected");
  });

  it("strips only one leading locale prefix", () => {
    expect(classifyPath("/fr/fr/protected", validConfig())).toBe("unprotected");
  });
});
