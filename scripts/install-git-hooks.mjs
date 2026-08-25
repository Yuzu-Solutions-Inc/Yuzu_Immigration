import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gitDir = join(root, ".git");

if (!existsSync(gitDir) || !statSync(gitDir).isDirectory()) {
  process.exit(0);
}

const dest = join(gitDir, "hooks", "pre-push");
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(join(root, "scripts/git-hooks/pre-push"), dest);
chmodSync(dest, 0o755);
