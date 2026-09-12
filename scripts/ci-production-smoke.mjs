import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const baseUrl = process.env.CI_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const startupDeadlineMs = 30_000;
const requestTimeoutMs = 8_000;
let logs = "";

function appendLog(chunk) {
  logs += chunk.toString();
  if (logs.length > 30_000) logs = logs.slice(-30_000);
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(`${baseUrl}${path}`, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServer(child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < startupDeadlineMs) {
    if (child.exitCode !== null) {
      throw new Error(`Production server exited before smoke test.\n${logs}`);
    }
    try {
      const response = await request("/api/health");
      if (response.status === 200) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Production server was not healthy within ${startupDeadlineMs}ms.\n${logs}`);
}

function sessionCookieFrom(response) {
  const raw = response.headers.get("set-cookie");
  if (!raw) throw new Error("Registration did not return a session cookie.");
  return raw.split(";", 1)[0];
}

const child = spawn(npmCommand, ["start"], {
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", appendLog);
child.stderr.on("data", appendLog);

try {
  await waitForServer(child);

  const health = await request("/api/health");
  if (health.status !== 200) throw new Error(`Health check returned ${health.status}.`);

  for (const path of ["/", "/login", "/register"]) {
    const response = await request(path, { redirect: "manual" });
    if (response.status !== 200) throw new Error(`${path} returned ${response.status}.`);
  }

  const email = `release-smoke-${randomUUID()}@example.test`;
  const register = await request("/api/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
    },
    body: JSON.stringify({
      name: "Release Smoke User",
      organizationName: "Release Smoke Company",
      email,
      password: "Release-Smoke-2026A",
    }),
  });
  if (register.status !== 200) {
    throw new Error(`Registration returned ${register.status}: ${await register.text()}`);
  }
  const cookie = sessionCookieFrom(register);

  const dashboard = await request("/api/dashboard", {
    headers: { cookie },
  });
  if (dashboard.status !== 200) {
    throw new Error(`Authenticated dashboard API returned ${dashboard.status}.`);
  }

  const logout = await request("/api/auth/logout", {
    method: "POST",
    headers: { cookie, origin: baseUrl },
  });
  if (logout.status !== 200) {
    throw new Error(`Logout returned ${logout.status}: ${await logout.text()}`);
  }

  const afterLogout = await request("/api/dashboard", {
    headers: { cookie },
  });
  if (afterLogout.status !== 401) {
    throw new Error(`Logged-out dashboard request returned ${afterLogout.status}, expected 401.`);
  }

  console.log("IMPORTPILOT_PRODUCTION_SMOKE PASS: health, public pages, registration, authenticated dashboard and logout lifecycle are healthy on the built app.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (logs.trim()) console.error(`--- production server log ---\n${logs}`);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
