import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { URL } from "node:url";
import { TextDecoder } from "node:util";

const root = resolve(import.meta.dirname, "..");
const sourceExtensions = new Set([
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
const documentationRanges = ["192.0.2", "198.51.100", "203.0.113"];
const packageMetadataDomains = ["eslint.org", "opencollective.com", "tidelift.com"];
const packageMetadataFields = new Set(["bugs", "funding", "homepage", "repository"]);

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function isAllowedDomain(hostname) {
  return (
    hostname.endsWith(".example") ||
    hostname === "registry.npmjs.org" ||
    allowedDomainSuffixes.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  );
}

function matchesDomain(hostname, domains) {
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function isPackageRegistryUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "registry.npmjs.org" && url.pathname.length > 1;
  } catch {
    return false;
  }
}

function isAllowedPackageMetadataUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (isAllowedDomain(url.hostname) || matchesDomain(url.hostname, packageMetadataDomains))
    );
  } catch {
    return false;
  }
}

function isDocumentationIpv4(value) {
  const octets = value.split(".").map(Number);
  return (
    octets.every((octet) => octet >= 0 && octet <= 255) &&
    documentationRanges.includes(octets.slice(0, 3).join("."))
  );
}

function isFixture(file) {
  return file.replaceAll("\\", "/").startsWith("tests/fixtures/");
}

function addMatchFailure(failures, file, source, ruleId, match) {
  failures.push({ file, ruleId, line: lineNumber(source, match.index) });
}

function addPackageLockUrlFailure(failures, file, source, value) {
  failures.push({ file, ruleId: "package-lock-url", line: lineNumber(source, source.indexOf(value)) });
}

function scanPackageMetadata(failures, file, source, value, field) {
  if (typeof value === "string") {
    if (!value.startsWith("http://") && !value.startsWith("https://")) {
      return;
    }
    const allowed = field === "resolved" ? isPackageRegistryUrl(value) : isAllowedPackageMetadataUrl(value);
    if (!allowed) {
      addPackageLockUrlFailure(failures, file, source, value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      scanPackageMetadata(failures, file, source, item, field);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      scanPackageMetadata(failures, file, source, nestedValue, field);
    }
  }
}

function scanPackageLock(file, source, failures) {
  let lockfile;
  try {
    lockfile = JSON.parse(source);
  } catch {
    failures.push({ file, ruleId: "invalid-package-lock", line: 1 });
    return;
  }

  if (!lockfile.packages || typeof lockfile.packages !== "object") {
    failures.push({ file, ruleId: "invalid-package-lock", line: 1 });
    return;
  }

  for (const metadata of Object.values(lockfile.packages)) {
    if (!metadata || typeof metadata !== "object") {
      continue;
    }
    for (const [field, value] of Object.entries(metadata)) {
      if (field === "resolved" || packageMetadataFields.has(field)) {
        scanPackageMetadata(failures, file, source, value, field);
      }
    }
  }
}

function scanSource(file, failures) {
  const absolutePath = resolve(root, file);
  const bytes = readFileSync(absolutePath);
  let source;

  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    failures.push({ file, ruleId: "invalid-utf8", line: 1 });
    return;
  }

  // eslint-disable-next-line no-control-regex -- publication validation must reject control bytes.
  for (const match of source.matchAll(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g)) {
    addMatchFailure(failures, file, source, "non-ascii-control", match);
  }

  if (file === "package-lock.json") {
    scanPackageLock(file, source, failures);
  } else {
    for (const match of source.matchAll(/https?:\/\/([^\s/"'<>\\]+)/g)) {
      const hostname = match[1]?.toLowerCase() ?? "";
      if (!isAllowedDomain(hostname)) {
        addMatchFailure(failures, file, source, "non-reserved-domain", match);
      }
    }
  }

  for (const match of source.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) {
    if (!isDocumentationIpv4(match[0])) {
      addMatchFailure(failures, file, source, "non-documentation-ipv4", match);
    }
  }

  if (!isFixture(file)) {
    for (const match of source.matchAll(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi)) {
      addMatchFailure(failures, file, source, "unexpected-uuid", match);
    }
  }

  for (const match of source.matchAll(/-----BEGIN [A-Z ]+ KEY-----/g)) {
    addMatchFailure(failures, file, source, "private-key", match);
  }

  for (const match of source.matchAll(/\bBearer\s+[A-Za-z0-9._~+/-]{20,}\b/gi)) {
    addMatchFailure(failures, file, source, "bearer-token", match);
  }
}

function scanFileName(file, failures) {
  const name = file.split("/").at(-1) ?? "";
  if (name === ".dev.vars" || name.startsWith(".env")) {
    failures.push({ file, ruleId: "environment-file", line: 1 });
  }
  if (name.endsWith(".map")) {
    failures.push({ file, ruleId: "source-map", line: 1 });
  }
  if (name.endsWith(".key") || name.endsWith(".pem")) {
    failures.push({ file, ruleId: "private-key-file", line: 1 });
  }
}

const failures = [];
for (const file of trackedFiles()) {
  scanFileName(file, failures);
  if (sourceExtensions.has(extname(file))) {
    scanSource(file, failures);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`${failure.file}:${failure.line} ${failure.ruleId}`);
  }
  process.exitCode = 1;
} else {
  console.log("Publication validation passed.");
}
