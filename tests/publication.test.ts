import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const publicSourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".jsonc",
  ".liquid",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
]);
const allowedDomainSuffixes = ["cloudflare.com", "github.com", "gnu.org", "opensource.org"];

function trackedSourceFiles(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((file) => publicSourceExtensions.has(extname(file)));
}

function isEnglishCompatible(file: string): boolean {
  const bytes = readFileSync(resolve(root, file));
  new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return bytes.every((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126));
}

function isAllowedDomain(hostname: string): boolean {
  return (
    hostname.endsWith(".example") ||
    allowedDomainSuffixes.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  );
}

type ValidatorResult = ReturnType<typeof spawnSync>;

function runPublicationValidator(): ValidatorResult {
  return spawnSync(process.execPath, [resolve(root, "scripts/validate-publication.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
}

function updateIndex(arguments_: string[]): void {
  execFileSync("git", ["update-index", ...arguments_], { cwd: root, stdio: "ignore" });
}

function withTrackedFixture(relativePath: string, source: string, assertion: () => void): void {
  const absolutePath = resolve(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, "utf8");

  try {
    updateIndex(["--add", "--", relativePath]);
    assertion();
  } finally {
    try {
      updateIndex(["--force-remove", "--", relativePath]);
    } catch {
      // A concurrent external Git operation can hold the index lock; cleanup still removes the fixture file.
    }
    rmSync(absolutePath);
    rmSync(dirname(absolutePath), { recursive: true, force: true });
  }
}

function withModifiedPackageLock(assertion: () => void): void {
  const relativePath = "package-lock.json";
  const absolutePath = resolve(root, relativePath);
  const original = readFileSync(absolutePath);
  const indexEntry = execFileSync("git", ["ls-files", "-s", "--", relativePath], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const [, mode, hash] = /^(\d+) ([0-9a-f]+)\s+\d+\t/.exec(indexEntry) ?? [];
  if (!mode || !hash) {
    throw new Error("package-lock.json must be tracked before validator tests run");
  }

  const lockfile = JSON.parse(original.toString()) as { packages: Record<string, Record<string, unknown>> };
  lockfile.packages[""] = {
    ...lockfile.packages[""],
    funding: { type: "individual", url: ["https://", "untrusted.invalid/funding"].join("") },
  };
  writeFileSync(absolutePath, `${JSON.stringify(lockfile, null, 2)}\n`, "utf8");

  try {
    updateIndex(["--add", "--", relativePath]);
    assertion();
  } finally {
    writeFileSync(absolutePath, original);
    try {
      updateIndex(["--cacheinfo", `${mode},${hash},${relativePath}`]);
    } catch {
      // A concurrent external Git operation can hold the index lock; the original lockfile is restored first.
    }
  }
}

describe("public repository boundary", () => {
  it.each(["LICENSE", "SECURITY.md"])("contains %s", (name) =>
    expect(readFileSync(resolve(root, name), "utf8").length).toBeGreaterThan(100),
  );

  it.each(["COMMERCIAL-LICENSE.md", "TRADEMARKS.md", "CLA.md"])("does not contain %s", (name) => {
    expect(existsSync(resolve(root, name))).toBe(false);
  });

  it("uses the public anti-scraping project identity consistently", () => {
    const packageMetadata = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      description: string;
      name: string;
    };
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const workerConfig = readFileSync(resolve(root, "wrangler.jsonc"), "utf8");

    expect(packageMetadata.name).toBe("storefront-anti-scraping-shield");
    expect(packageMetadata.description).toContain("anti-scraping");
    expect(readme).toContain("# Storefront Anti-Scraping Shield");
    expect(workerConfig).toContain('"name": "storefront-anti-scraping-shield"');
  });

  it.each([
    "docs/architecture.md",
    "docs/configuration.md",
    "docs/deployment.md",
    "docs/threat-model.md",
    "docs/api.md",
    "examples/basic-integration.html",
    ".github/workflows/ci.yml",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
  ])("contains the professional repository surface file %s", (name) => {
    expect(readFileSync(resolve(root, name), "utf8").length).toBeGreaterThan(100);
  });

  it("uses neutral reserved examples in configuration", () => {
    const config = readFileSync(resolve(root, "wrangler.jsonc"), "utf8");
    expect(config).toContain("https://site.example");
    expect(config).toContain("/protected");
    expect(config).toContain("/excluded");
    expect(config).toContain("https://destination.example/safe");
  });

  it("keeps tracked public source files UTF-8 and English-compatible", () => {
    const incompatible = trackedSourceFiles().filter((file) => !isEnglishCompatible(file));
    expect(incompatible).toEqual([]);
  });

  it("uses only reserved or public documentation domains", () => {
    const disallowed = trackedSourceFiles()
      .filter((file) => file !== "package-lock.json")
      .flatMap((file) => {
        const source = readFileSync(resolve(root, file), "utf8");
        const hosts = [...source.matchAll(/https?:\/\/([^\s/"'<>\\]+)/g)].map(
          (match) => match[1]?.toLowerCase() ?? "",
        );
        return hosts
          .filter((host) => !isAllowedDomain(host))
          .map((host) => `${relative(root, resolve(root, file))}: ${host}`);
      });

    expect(disallowed).toEqual([]);
  });

  it("rejects bearer-format credentials without printing their value", () => {
    const credential = ["Bearer", "a".repeat(24)].join(" ");
    withTrackedFixture("tests/.publication-validator-fixtures/bearer.md", credential, () => {
      const result = runPublicationValidator();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("tests/.publication-validator-fixtures/bearer.md:1 bearer-token");
      expect(result.stderr).not.toContain(credential);
    });
  });

  it("rejects private-key credentials without printing their value", () => {
    const privateKey = ["-----" + "BEGIN PRIVATE KEY" + "-----", "unit-test-material"].join("\n");
    withTrackedFixture("tests/.publication-validator-fixtures/private-key.md", privateKey, () => {
      const result = runPublicationValidator();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("tests/.publication-validator-fixtures/private-key.md:1 private-key");
      expect(result.stderr).not.toContain(privateKey);
    });
  });

  it("rejects a non-allowlisted package-lock destination without printing it", () => {
    const destination = ["https://", "untrusted.invalid/funding"].join("");
    withModifiedPackageLock(() => {
      const result = runPublicationValidator();
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/package-lock\.json:\d+ package-lock-url/);
      expect(result.stderr).not.toContain(destination);
    });
  });
});
