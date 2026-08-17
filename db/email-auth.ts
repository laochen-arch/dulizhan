import { ensureCmsSchema, getCmsDatabase } from "./cms";

export type EmailAuthUser = { userId: string; displayName: string; email: string; fullName: string | null; emailVerifiedAt: string | null };

function now() { return new Date().toISOString(); }
function normalizeEmail(value: string) { const email = value.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("INVALID_EMAIL"); return email; }
function token() { return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`; }
async function hash(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, "0")).join(""); }
async function hashPassword(password: string, salt: string) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]); const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100_000, hash: "SHA-256" }, key, 256); return Array.from(new Uint8Array(bits)).map((item) => item.toString(16).padStart(2, "0")).join(""); }
function userFromRow(row: Record<string, unknown>): EmailAuthUser { const id = String(row.id); return { userId: `email:${id}`, displayName: String(row.displayName || row.email), email: String(row.email), fullName: row.fullName ? String(row.fullName) : null, emailVerifiedAt: row.emailVerifiedAt ? String(row.emailVerifiedAt) : null }; }

export async function ensureEmailAuthSchema() {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS email_users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', email_verified_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS email_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS email_auth_tokens (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS email_auth_rate_limits (
      key TEXT PRIMARY KEY, window_started_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS email_sessions_user_idx ON email_sessions(user_id, expires_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS email_tokens_user_idx ON email_auth_tokens(user_id, kind, expires_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS email_auth_rate_limits_window_idx ON email_auth_rate_limits(window_started_at)"),
  ]);
}

export async function findEmailUser(email: string) {
  await ensureEmailAuthSchema();
  const database = getCmsDatabase();
  const row = await database.prepare(`SELECT id, email, display_name AS displayName, email_verified_at AS emailVerifiedAt FROM email_users WHERE lower(email) = lower(?1) AND status = 'active'`).bind(normalizeEmail(email)).first<Record<string, unknown>>();
  return row ? userFromRow(row) : null;
}

export async function registerEmailUser(input: { email: string; password: string; displayName: string }) {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim().slice(0, 120);
  if (input.password.length < 8) throw new Error("PASSWORD_TOO_SHORT");
  if (!displayName) throw new Error("DISPLAY_NAME_REQUIRED");
  await ensureEmailAuthSchema();
  const database = getCmsDatabase();
  const salt = token().slice(0, 32);
  const passwordHash = await hashPassword(input.password, salt);
  const id = crypto.randomUUID();
  try {
    await database.prepare("INSERT INTO email_users (id, email, display_name, password_hash, password_salt, status, email_verified_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'active', NULL, ?6, ?6)").bind(id, email, displayName, passwordHash, salt, now()).run();
  } catch (error) { if (String(error).toLowerCase().includes("unique")) throw new Error("EMAIL_EXISTS"); throw error; }
  const user = await findEmailUser(email);
  if (!user) throw new Error("AUTH_USER_NOT_CREATED");
  const verificationToken = await issueEmailAuthToken(id, "verify_email");
  const sessionToken = await createEmailSession(id);
  return { user, verificationToken, sessionToken };
}

export async function loginEmailUser(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  await ensureEmailAuthSchema();
  const database = getCmsDatabase();
  const row = await database.prepare("SELECT id, email, display_name AS displayName, email_verified_at AS emailVerifiedAt, password_hash AS passwordHash, password_salt AS passwordSalt FROM email_users WHERE lower(email) = lower(?1) AND status = 'active'").bind(email).first<Record<string, unknown>>();
  if (!row || typeof row.id !== "string" || typeof row.passwordHash !== "string" || typeof row.passwordSalt !== "string" || await hashPassword(password, row.passwordSalt) !== row.passwordHash) throw new Error("INVALID_CREDENTIALS");
  return { user: userFromRow(row), sessionToken: await createEmailSession(String(row.id)) };
}

async function createEmailSession(userId: string) {
  await ensureEmailAuthSchema();
  const database = getCmsDatabase();
  const raw = token(); const timestamp = now();
  await database.prepare("INSERT INTO email_sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)").bind(`email_session_${crypto.randomUUID()}`, userId, await hash(raw), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), timestamp).run();
  return raw;
}

export async function getEmailUserBySessionToken(rawToken: string) {
  if (!rawToken) return null;
  await ensureEmailAuthSchema();
  const database = getCmsDatabase();
  const row = await database.prepare(`SELECT u.id, u.email, u.display_name AS displayName, u.email_verified_at AS emailVerifiedAt
    FROM email_sessions s JOIN email_users u ON u.id = s.user_id
    WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND u.status = 'active'`).bind(await hash(rawToken), now()).first<Record<string, unknown>>();
  return row ? userFromRow(row) : null;
}

export async function revokeEmailSession(rawToken: string) { if (!rawToken) return; await ensureEmailAuthSchema(); await getCmsDatabase().prepare("DELETE FROM email_sessions WHERE token_hash = ?1").bind(await hash(rawToken)).run(); }

export async function consumeEmailAuthRateLimit(scope: string, subject: string, limit: number, windowMs: number) {
  await ensureEmailAuthSchema();
  const database = getCmsDatabase();
  const currentMs = Date.now();
  const windowStart = currentMs - (currentMs % windowMs);
  const key = await hash(`${scope}:${subject}`);
  const timestamp = now();
  await database.prepare(`INSERT INTO email_auth_rate_limits (key, window_started_at, attempts, updated_at)
    VALUES (?1, ?2, 1, ?3)
    ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN email_auth_rate_limits.window_started_at = excluded.window_started_at THEN email_auth_rate_limits.attempts + 1 ELSE 1 END,
      window_started_at = excluded.window_started_at,
      updated_at = excluded.updated_at`).bind(key, windowStart, timestamp).run();
  await database.prepare("DELETE FROM email_auth_rate_limits WHERE window_started_at < ?1").bind(currentMs - windowMs * 2).run();
  const row = await database.prepare("SELECT attempts, window_started_at AS windowStartedAt FROM email_auth_rate_limits WHERE key = ?1").bind(key).first<{ attempts: number; windowStartedAt: number }>();
  const attempts = Number(row?.attempts || 0);
  const resetAt = Number(row?.windowStartedAt || windowStart) + windowMs;
  return { allowed: attempts <= limit, attempts, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - currentMs) / 1000)) };
}

export async function issueEmailAuthToken(userId: string, kind: "verify_email" | "reset_password") {
  await ensureEmailAuthSchema();
  const raw = token(); const timestamp = now();
  await getCmsDatabase().prepare("INSERT INTO email_auth_tokens (id, user_id, token_hash, kind, expires_at, used_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6)").bind(`email_auth_token_${crypto.randomUUID()}`, userId, await hash(raw), kind, new Date(Date.now() + (kind === "verify_email" ? 24 : 1) * 60 * 60 * 1000).toISOString(), timestamp).run();
  return raw;
}

export async function consumeEmailAuthToken(rawToken: string, kind: "verify_email" | "reset_password") {
  await ensureEmailAuthSchema();
  const database = getCmsDatabase();
  const row = await database.prepare("SELECT id, user_id AS userId FROM email_auth_tokens WHERE token_hash = ?1 AND kind = ?2 AND used_at IS NULL AND expires_at > ?3").bind(await hash(rawToken), kind, now()).first<{ id: string; userId: string }>();
  if (!row) throw new Error("AUTH_TOKEN_INVALID");
  await database.prepare("UPDATE email_auth_tokens SET used_at = ?1 WHERE id = ?2").bind(now(), row.id).run();
  return row.userId;
}

export async function verifyEmailUser(rawToken: string) {
  const userId = await consumeEmailAuthToken(rawToken, "verify_email");
  const timestamp = now();
  await getCmsDatabase().prepare("UPDATE email_users SET email_verified_at = ?1, updated_at = ?1 WHERE id = ?2").bind(timestamp, userId).run();
  return true;
}

export async function createPasswordResetToken(email: string) {
  const user = await findEmailUser(email);
  if (!user) return null;
  const raw = await issueEmailAuthToken(user.userId.replace(/^email:/, ""), "reset_password");
  return { user, token: raw };
}

export async function resetEmailPassword(rawToken: string, password: string) {
  if (password.length < 8) throw new Error("PASSWORD_TOO_SHORT");
  const userId = await consumeEmailAuthToken(rawToken, "reset_password");
  const salt = token().slice(0, 32); const passwordHash = await hashPassword(password, salt); const timestamp = now();
  await getCmsDatabase().prepare("UPDATE email_users SET password_hash = ?1, password_salt = ?2, updated_at = ?3 WHERE id = ?4").bind(passwordHash, salt, timestamp, userId).run();
  return true;
}
