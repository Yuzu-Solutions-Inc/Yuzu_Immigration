/**
 * Continuous control tests for Yuzu Immigration.
 * Static, no secrets, no network. Fail the process on any finding.
 *
 *   npm run security:controls
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PRIVILEGED_IMPORTS = [
  "@/lib/env",
  "@/lib/supabase/admin",
  "@/lib/security/app-encryption-key",
  "@/lib/security/field-crypto",
  "@/lib/security/org-data-key",
  "@/lib/documents/crypto",
  "@/lib/zoom/secrets",
  "@/lib/google/secrets",
  "@/lib/microsoft/secrets",
  "@/lib/sage/secrets",
  "@/lib/square/secrets",
  "@/lib/portal/auth",
];

const SECRET_FILE_MODULES = [
  "src/lib/zoom/secrets.ts",
  "src/lib/google/secrets.ts",
  "src/lib/microsoft/secrets.ts",
  "src/lib/sage/secrets.ts",
  "src/lib/square/secrets.ts",
];

const LIVE_SECRET_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "jwt", re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
  { id: "aws", re: /AKIA[0-9A-Z]{16}/ },
  { id: "stripe-live", re: /sk_live_[A-Za-z0-9]{20,}/ },
  { id: "private-key", re: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/ },
];

type Finding = { file: string; detail: string };

type ControlResult = {
  id: string;
  name: string;
  pass: boolean;
  findings: Finding[];
};

const results: ControlResult[] = [];

function rel(filePath: string) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function read(relPath: string) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function sourceFiles() {
  return walk(path.join(ROOT, "src")).filter((file) => /\.(ts|tsx|js|mjs)$/.test(file));
}

function stripBlockComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function isClientModule(source: string) {
  const lines = stripBlockComments(source)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"));
  const first = lines[0] ?? "";
  return /^["']use client["']\s*;?$/.test(first);
}

function importedSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const fromRe = /\bfrom\s+["']([^"']+)["']/g;
  const dynRe = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = fromRe.exec(source))) specs.push(match[1]);
  while ((match = dynRe.exec(source))) specs.push(match[1]);
  return specs;
}

function record(id: string, name: string, findings: Finding[]) {
  results.push({ id, name, pass: findings.length === 0, findings });
}

function cc01ClientEnvIsolation() {
  const findings: Finding[] = [];
  const publicEnv = read("src/lib/public-env.ts");
  const envAssigns = [
    ...publicEnv.matchAll(/process\.env\.([A-Z0-9_]+)/g),
  ].map((match) => match[1]);
  for (const name of envAssigns) {
    if (!name.startsWith("NEXT_PUBLIC_")) {
      findings.push({
        file: "src/lib/public-env.ts",
        detail: `${name} is not a NEXT_PUBLIC_* name`,
      });
    }
  }
  const forbiddenPublic = /(SERVICE_ROLE|SECRET|ENCRYPTION_KEY|DATABASE_URL|CRON_SECRET)/;
  for (const name of envAssigns) {
    if (forbiddenPublic.test(name) && !name.endsWith("_ANON_KEY")) {
      findings.push({
        file: "src/lib/public-env.ts",
        detail: `${name} must not be exposed to the browser`,
      });
    }
  }
  record("CC-01", "Browser env exposes only NEXT_PUBLIC_* names", findings);
}

function cc02ServerOnlySecretsModule() {
  const findings: Finding[] = [];
  const env = read("src/lib/env.ts");
  if (!/import ["']server-only["']/.test(env)) {
    findings.push({
      file: "src/lib/env.ts",
      detail: 'missing import "server-only"',
    });
  }
  const admin = read("src/lib/supabase/admin.ts");
  if (!/SERVER ONLY/.test(admin)) {
    findings.push({
      file: "src/lib/supabase/admin.ts",
      detail: "missing SERVER ONLY marker",
    });
  }
  if (!/env\.SUPABASE_SERVICE_ROLE_KEY/.test(admin)) {
    findings.push({
      file: "src/lib/supabase/admin.ts",
      detail: "service role key must be read from server env",
    });
  }
  const client = read("src/lib/supabase/client.ts");
  if (client.includes("@/lib/env") || client.includes("supabase/admin")) {
    findings.push({
      file: "src/lib/supabase/client.ts",
      detail: "browser client must not import server secrets",
    });
  }
  record("CC-02", "Server secrets stay in server-only modules", findings);
}

function cc03NoPrivilegedClientImports() {
  const findings: Finding[] = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, "utf8");
    if (!isClientModule(source)) continue;
    const imports = importedSpecifiers(source);
    for (const spec of imports) {
      if (PRIVILEGED_IMPORTS.includes(spec)) {
        findings.push({ file: rel(file), detail: `imports ${spec}` });
      }
    }
    if (/\bcreateServiceClient\b/.test(source)) {
      findings.push({
        file: rel(file),
        detail: "references createServiceClient",
      });
    }
    if (/\bSUPABASE_SERVICE_ROLE_KEY\b|\bDOCUMENT_ENCRYPTION_KEY\b/.test(source)) {
      findings.push({
        file: rel(file),
        detail: "references a server secret env name",
      });
    }
  }
  record("CC-03", "Client components do not import privileged server modules", findings);
}

function cc04AesGcmAuthTags() {
  const findings: Finding[] = [];
  const files = [
    "src/lib/security/field-crypto.ts",
    "src/lib/documents/crypto.ts",
  ];
  for (const file of files) {
    const source = read(file);
    if (!source.includes('"aes-256-gcm"') && !source.includes("'aes-256-gcm'")) {
      findings.push({ file, detail: "AES-256-GCM algorithm missing" });
    }
    if (!/AUTH_TAG_LENGTH\s*=\s*16/.test(source)) {
      findings.push({ file, detail: "auth tag length must be 16" });
    }
    if (!/authTagLength:\s*AUTH_TAG_LENGTH/.test(source)) {
      findings.push({ file, detail: "createCipheriv/createDecipheriv must set authTagLength" });
    }
  }
  for (const file of sourceFiles()) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("createCipheriv")) continue;
    if (!/authTagLength/.test(source)) {
      findings.push({
        file: rel(file),
        detail: "createCipheriv without authTagLength",
      });
    }
  }
  record("CC-04", "Field and document crypto uses AES-256-GCM with 16-byte tags", findings);
}

function cc05OauthSecretsViaPrivateRpc() {
  const findings: Finding[] = [];
  for (const file of SECRET_FILE_MODULES) {
    const source = read(file);
    if (isClientModule(source)) {
      findings.push({ file, detail: "must not be a client module" });
    }
    if (!source.includes('@/lib/supabase/admin')) {
      findings.push({ file, detail: "must use the service-role client" });
    }
    if (!/\.rpc\(\s*["'](?:get_|upsert_|patch_)/.test(source)) {
      findings.push({ file, detail: "must persist tokens through private RPCs" });
    }
  }
  record("CC-05", "OAuth tokens persist through private RPCs, not client tables", findings);
}

function cc06CronBearerAuth() {
  const findings: Finding[] = [];
  const vercel = JSON.parse(read("vercel.json")) as {
    crons?: { path: string; schedule: string }[];
  };
  const crons = vercel.crons ?? [];
  if (crons.length === 0) {
    findings.push({ file: "vercel.json", detail: "no cron jobs declared" });
  }
  for (const cron of crons) {
    const route = path.join(ROOT, "src/app", cron.path, "route.ts");
    if (!existsSync(route)) {
      findings.push({
        file: "vercel.json",
        detail: `${cron.path} has no matching route.ts`,
      });
      continue;
    }
    const source = readFileSync(route, "utf8");
    const hasSecret = /CRON_SECRET/.test(source);
    const hasCompare = /timingSafeEqual/.test(source);
    if (!hasSecret || !hasCompare) {
      findings.push({
        file: rel(route),
        detail: "cron route must check Authorization Bearer with timingSafeEqual",
      });
    }
  }
  const cronDir = path.join(ROOT, "src/app/api/cron");
  for (const file of walk(cronDir).filter((name) => name.endsWith("route.ts"))) {
    const source = readFileSync(file, "utf8");
    if (!/CRON_SECRET/.test(source) || !/timingSafeEqual/.test(source)) {
      findings.push({
        file: rel(file),
        detail: "cron route must require CRON_SECRET",
      });
    }
  }
  record("CC-06", "Scheduled jobs require a bearer cron secret", findings);
}

function cc07WebhookVerification() {
  const findings: Finding[] = [];
  const webhookRoutes = walk(path.join(ROOT, "src/app/api")).filter((file) =>
    file.replace(/\\/g, "/").endsWith("/webhook/route.ts"),
  );
  if (webhookRoutes.length === 0) {
    findings.push({
      file: "src/app/api",
      detail: "expected webhook routes",
    });
  }
  for (const file of webhookRoutes) {
    const source = readFileSync(file, "utf8");
    const verified =
      /verifySquareWebhookSignature/.test(source) ||
      /verifyGoogleChannelToken/.test(source) ||
      /verifyMicrosoftChannelToken/.test(source) ||
      /timingSafeEqual/.test(source);
    if (!verified) {
      findings.push({
        file: rel(file),
        detail: "webhook must verify a signature or channel token",
      });
    }
  }
  record("CC-07", "Inbound webhooks verify signatures or channel tokens", findings);
}

function cc08NoCommittedLiveSecrets() {
  const findings: Finding[] = [];
  const envExample = read(".env.example");
  for (const rawLine of envExample.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    const looksSecret =
      /(SECRET|SERVICE_ROLE|ENCRYPTION_KEY|DATABASE_URL|CRON_SECRET|PASSWORD|API_KEY|WEBHOOK_SIGNATURE|ANON_KEY)$/.test(
        key,
      );
    if (looksSecret && value.length > 0 && !value.endsWith("...") && value !== "sandbox") {
      findings.push({
        file: ".env.example",
        detail: `${key} must be an empty placeholder`,
      });
    }
  }

  const files = [
    path.join(ROOT, ".env.example"),
    path.join(ROOT, "next.config.ts"),
    ...sourceFiles(),
    ...walk(path.join(ROOT, "scripts")).filter((file) => /\.(ts|mjs|js)$/.test(file)),
  ];

  const seen = new Set<string>();
  for (const file of files) {
    if (!existsSync(file)) continue;
    const key = rel(file);
    if (seen.has(key) || key === "scripts/continuous-controls.ts") continue;
    seen.add(key);
    const source = readFileSync(file, "utf8");
    for (const pattern of LIVE_SECRET_PATTERNS) {
      if (pattern.re.test(source)) {
        findings.push({
          file: key,
          detail: `looks like a live ${pattern.id} secret`,
        });
      }
    }
  }
  record("CC-08", "No live secrets committed in source or .env.example", findings);
}

function cc09SecurityHeaders() {
  const findings: Finding[] = [];
  const config = read("next.config.ts");
  const required = [
    ["X-Frame-Options", "DENY"],
    ["X-Content-Type-Options", "nosniff"],
    ["frame-ancestors 'none'", "frame-ancestors 'none'"],
  ];
  for (const [name, needle] of required) {
    if (!config.includes(needle)) {
      findings.push({
        file: "next.config.ts",
        detail: `missing ${name}`,
      });
    }
  }
  record("CC-09", "App responses set framing and content-type security headers", findings);
}

function cc10PortalLoginServerOnly() {
  const findings: Finding[] = [];
  const needle = "verify_customer_portal_login";
  for (const file of sourceFiles()) {
    const source = readFileSync(file, "utf8");
    if (!source.includes(needle)) continue;
    const relative = rel(file);
    if (relative !== "src/lib/portal/auth.ts") {
      findings.push({
        file: relative,
        detail: "portal login RPC must stay in the server auth module",
      });
    }
    if (isClientModule(source)) {
      findings.push({
        file: relative,
        detail: "portal login RPC must not ship in a client module",
      });
    }
  }
  if (!read("src/lib/portal/auth.ts").includes(needle)) {
    findings.push({
      file: "src/lib/portal/auth.ts",
      detail: "expected verify_customer_portal_login",
    });
  }
  record("CC-10", "Portal password verification stays server-only", findings);
}

function cc11AuditTrailPresent() {
  const findings: Finding[] = [];
  const audit = read("src/lib/security/audit.ts");
  if (!/export async function recordAuditEvent/.test(audit)) {
    findings.push({
      file: "src/lib/security/audit.ts",
      detail: "recordAuditEvent export missing",
    });
  }
  if (!audit.includes("security_audit_events")) {
    findings.push({
      file: "src/lib/security/audit.ts",
      detail: "must insert into security_audit_events",
    });
  }
  const schema = read("src/db/schema.ts");
  if (!/securityAuditEvents|security_audit_events/.test(schema)) {
    findings.push({
      file: "src/db/schema.ts",
      detail: "security_audit_events table missing from schema",
    });
  }
  record("CC-11", "Append-only security audit events module is present", findings);
}

function cc12ServiceRoleNotInClientBundles() {
  const findings: Finding[] = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, "utf8");
    const relative = rel(file);
    if (relative === "src/lib/supabase/admin.ts") continue;
    if (relative === "src/lib/env.ts") continue;
    if (relative === "src/lib/auth/admin-users.ts") continue;
    if (
      source.includes("process.env.SUPABASE_SERVICE_ROLE_KEY") &&
      isClientModule(source)
    ) {
      findings.push({
        file: relative,
        detail: "reads SUPABASE_SERVICE_ROLE_KEY in a client module",
      });
    }
  }
  record("CC-12", "Service-role key is not read from client modules", findings);
}

cc01ClientEnvIsolation();
cc02ServerOnlySecretsModule();
cc03NoPrivilegedClientImports();
cc04AesGcmAuthTags();
cc05OauthSecretsViaPrivateRpc();
cc06CronBearerAuth();
cc07WebhookVerification();
cc08NoCommittedLiveSecrets();
cc09SecurityHeaders();
cc10PortalLoginServerOnly();
cc11AuditTrailPresent();
cc12ServiceRoleNotInClientBundles();

const failed = results.filter((row) => !row.pass);
const passed = results.filter((row) => row.pass);

for (const row of results) {
  const mark = row.pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${row.id}  ${row.name}`);
  for (const finding of row.findings) {
    console.log(`      ${finding.file}: ${finding.detail}`);
  }
}

console.log("");
console.log(`${passed.length} passed, ${failed.length} failed, ${results.length} controls`);

const summaryLines = [
  "## Continuous controls",
  "",
  `| Result | ID | Control |`,
  `|---|---|---|`,
  ...results.map((row) => {
    const mark = row.pass ? "PASS" : "FAIL";
    return `| ${mark} | ${row.id} | ${row.name} |`;
  }),
  "",
];
if (failed.length) {
  summaryLines.push("### Findings", "");
  for (const row of failed) {
    for (const finding of row.findings) {
      summaryLines.push(`- **${row.id}** \`${finding.file}\`: ${finding.detail}`);
    }
  }
  summaryLines.push("");
}

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryLines.join("\n"));
}

if (failed.length) {
  process.exitCode = 1;
}
