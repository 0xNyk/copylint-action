// Copylint GitHub Action. No dependencies: Node 20 has fetch and fs.
// On pull requests it scans the Markdown the PR changed; otherwise the glob.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const input = (name, fallback) => process.env[`INPUT_${name.toUpperCase().replace(/-/g, "_")}`] ?? fallback;
const out = (level, file, line, msg) => console.log(`::${level} file=${file},line=${line}::${msg}`);

function changedFiles() {
  const base = process.env.GITHUB_BASE_REF;
  if (!base) return null;
  try {
    execSync(`git fetch --no-tags --depth=1 origin ${base}`, { stdio: "ignore" });
    return execSync(`git diff --name-only --diff-filter=d origin/${base}... -- '*.md' '*.mdx' '*.txt'`, { encoding: "utf8" })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function globFiles(pattern) {
  const ext = pattern.match(/\*\.(\w+)$/)?.[1] ?? "md";
  const list = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith(`.${ext}`)) list.push(p);
    }
  };
  walk(".");
  return list;
}

async function main() {
  const key = input("api-key");
  if (!key) {
    console.log("::error::api-key input is required");
    process.exit(2);
  }
  const endpoint = input("endpoint", "https://copylint.vercel.app").replace(/\/$/, "");
  const threshold = Number(input("threshold", "40"));
  const personal = input("personal", "false") === "true";
  const files = changedFiles() ?? globFiles(input("files", "**/*.md"));
  if (!files.length) {
    console.log("Copylint: nothing to scan");
    return;
  }

  let failed = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    if (!text.trim()) continue;
    const res = await fetch(`${endpoint}/api/v1/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, threshold, personal, title: file }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.log(`::error::Copylint ${res.status} for ${file}: ${body.slice(0, 200)}`);
      process.exit(2);
    }
    const r = await res.json();
    for (const f of r.findings) {
      out(f.severity === "minor" ? "notice" : "warning", file, f.line ?? 1, `${f.severity} ${f.rule}: ${f.detail}`);
    }
    console.log(`${file}: ${r.score}/100 (threshold ${threshold}) -> ${r.pass ? "PASS" : "FAIL"}`);
    if (!r.pass) {
      failed += 1;
      out("error", file, 1, `slop score ${r.score}/100 is at or above ${threshold}`);
    }
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n## Copylint\n\n${files.length} file(s) scanned, ${failed} failed the floor of ${threshold}.\n`);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.log(`::error::${e.message}`);
  process.exit(2);
});
