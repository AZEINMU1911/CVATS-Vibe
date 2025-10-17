import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const prismaBinary = (() => {
  const binDir = path.resolve(process.cwd(), "node_modules", ".bin");
  const unixPath = path.join(binDir, "prisma");
  if (process.platform === "win32") {
    const winPath = `${unixPath}.cmd`;
    return existsSync(winPath) ? winPath : unixPath;
  }
  return unixPath;
})();

const runGenerate = (): number => {
  if (!existsSync(prismaBinary)) {
    console.warn("[prisma] CLI binary not found, skipping generate.");
    return 0;
  }
  const result = spawnSync(prismaBinary, ["generate"], { stdio: "inherit" });
  return result.status ?? 1;
};

const status = runGenerate();
if (status === 0) {
  process.exit(0);
}

if (process.env.CI) {
  process.exit(status);
}

console.warn(
  "[prisma] generate failed in local/offline mode. Continuing with stubbed client types.",
);
process.exit(0);
