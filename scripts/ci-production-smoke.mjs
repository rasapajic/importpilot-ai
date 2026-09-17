import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";

const baseUrl = process.env.CI_SMOKE_BASE_URL ?? "http://localhost:3000";
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
  if (!raw) throw new Error("Auth response did not return a session cookie.");
  return raw.split(";", 1)[0];
}

function expectRedirect(response, path, label) {
  if (response.status !== 303) {
    throw new Error(`${label} returned ${response.status}, expected 303.`);
  }
  const location = response.headers.get("location");
  if (location !== `${baseUrl}${path}`) {
    throw new Error(`${label} redirected to ${location}, expected ${baseUrl}${path}.`);
  }
}

async function assertDashboard(cookie, expectedStatus, label) {
  const response = await request("/api/dashboard", { headers: { cookie } });
  if (response.status !== expectedStatus) {
    throw new Error(`${label} dashboard returned ${response.status}, expected ${expectedStatus}.`);
  }
}

async function logout(cookie, label) {
  const response = await request("/api/auth/logout", {
    method: "POST",
    headers: { cookie, origin: baseUrl },
  });
  if (response.status !== 200) {
    throw new Error(`${label} logout returned ${response.status}: ${await response.text()}`);
  }
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const forceKill = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 4_000);
    const hardDeadline = setTimeout(() => {
      clearTimeout(forceKill);
      resolve();
    }, 7_000);
    child.once("exit", () => {
      clearTimeout(forceKill);
      clearTimeout(hardDeadline);
      resolve();
    });
  });
}

function prepareStandaloneRuntime() {
  const standaloneRoot = ".next/standalone";
  if (!existsSync(`${standaloneRoot}/server.js`)) {
    throw new Error("Standalone production server was not produced by next build.");
  }
  mkdirSync(`${standaloneRoot}/.next`, { recursive: true });
  if (existsSync(".next/static")) {
    cpSync(".next/static", `${standaloneRoot}/.next/static`, { recursive: true });
  }
  if (existsSync("public")) {
    cpSync("public", `${standaloneRoot}/public`, { recursive: true });
  }
}

prepareStandaloneRuntime();

const child = spawn(process.execPath, [".next/standalone/server.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "localhost",
    PORT: "3000",
  },
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

  const loginPage = await request("/login");
  const loginHtml = await loginPage.text();
  if (!loginHtml.includes("Continue with Google")) {
    throw new Error("Production login page does not render the Google Sign-In action.");
  }
  if (!loginHtml.includes('method="post"') || !loginHtml.includes('action="/api/auth/login"')) {
    throw new Error("Production login page is missing the native POST fallback contract.");
  }

  const registerPage = await request("/register");
  const registerHtml = await registerPage.text();
  if (!registerHtml.includes('method="post"') || !registerHtml.includes('action="/api/auth/register"')) {
    throw new Error("Production registration page is missing the native POST fallback contract.");
  }

  const googleWithoutCredentials = await request("/api/auth/google/start?from=login", {
    redirect: "manual",
  });
  if (googleWithoutCredentials.status !== 307) {
    throw new Error(
      `Google start route without credentials returned ${googleWithoutCredentials.status}, expected controlled redirect.`,
    );
  }
  const googleLocation = googleWithoutCredentials.headers.get("location");
  if (googleLocation !== `${baseUrl}/login?googleError=not-configured`) {
    throw new Error(`Google start route returned unexpected controlled redirect: ${googleLocation}`);
  }

  const nativeEmail = `release-native-${randomUUID()}@example.test`;
  const nativePassword = "Release-Native-2026A";
  const nativeRegister = await request("/api/auth/register", {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: baseUrl,
    },
    body: new URLSearchParams({
      name: "Native Release User",
      organizationName: "Native Release Company",
      email: nativeEmail,
      password: nativePassword,
    }),
  });
  expectRedirect(nativeRegister, "/dashboard", "Native registration");
  const nativeCookie = sessionCookieFrom(nativeRegister);
  await assertDashboard(nativeCookie, 200, "Native registration");
  await logout(nativeCookie, "Native registration");
  await assertDashboard(nativeCookie, 401, "Native registration after logout");

  const nativeLogin = await request("/api/auth/login", {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: baseUrl,
    },
    body: new URLSearchParams({
      email: nativeEmail,
      password: nativePassword,
    }),
  });
  expectRedirect(nativeLogin, "/dashboard", "Native login");
  const nativeLoginCookie = sessionCookieFrom(nativeLogin);
  await assertDashboard(nativeLoginCookie, 200, "Native login");
  await logout(nativeLoginCookie, "Native login");

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
  if (register.status !== 201) {
    throw new Error(`JSON registration returned ${register.status}, expected 201: ${await register.text()}`);
  }
  const cookie = sessionCookieFrom(register);

  await assertDashboard(cookie, 200, "JSON registration");
  await logout(cookie, "JSON registration");
  await assertDashboard(cookie, 401, "JSON registration after logout");

  console.log("IMPORTPILOT_PRODUCTION_SMOKE PASS: standalone runtime health, Google auth entry/fail-closed route, native form registration/login fallback, JSON auth, authenticated dashboard and logout lifecycle are healthy.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (logs.trim()) console.error(`--- production server log ---\n${logs}`);
  process.exitCode = 1;
} finally {
  await stopServer(child);
}
