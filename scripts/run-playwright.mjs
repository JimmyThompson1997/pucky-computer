import { spawn } from "node:child_process";

const mode = process.argv[2] || "local";
const extraArgs = process.argv.slice(3);
const env = { ...process.env };

if (mode === "live") {
  env.LANDING_BASE_URL = env.LANDING_BASE_URL || "https://pucky-computer.vercel.app";
} else {
  delete env.LANDING_BASE_URL;
}

const command = process.platform === "win32" ? "npx playwright test" : "npx playwright test";
const fullCommand = [command, ...extraArgs].join(" ");
const child = spawn(fullCommand, {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  shell: true
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
