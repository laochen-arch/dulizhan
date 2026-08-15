import { env } from "cloudflare:workers";
import type { D1DatabaseLike } from "./cms";

export type SiteIntegrationProvider = "paypal" | "resend";
export type IntegrationSource = "site" | "legacy" | "missing";

type WorkerSecrets = {
  CMS_SECRETS_KEY?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_WEBHOOK_ID?: string;
  PAYPAL_ENVIRONMENT?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

type IntegrationRow = {
  siteId: string;
  provider: SiteIntegrationProvider;
  status: string;
  clientIdCipher: string | null;
  clientSecretCipher: string | null;
  webhookIdCipher: string | null;
  apiKeyCipher: string | null;
  environment: string;
  fromEmail: string | null;
  fromDomain: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SiteProviderCredentials = {
  provider: SiteIntegrationProvider;
  source: IntegrationSource;
  configured: boolean;
  hasEncryptionKey: boolean;
  environment: "sandbox" | "live";
  clientId?: string;
  clientSecret?: string;
  webhookId?: string;
  apiKey?: string;
  fromEmail?: string;
  fromDomain?: string | null;
  lastCheckedAt?: string | null;
  lastError?: string | null;
};

export type SiteIntegrationStatus = {
  provider: SiteIntegrationProvider;
  source: IntegrationSource;
  status: "ready" | "missing" | "error";
  configured: boolean;
  hasEncryptionKey: boolean;
  environment?: "sandbox" | "live";
  clientId: boolean;
  clientSecret: boolean;
  webhookId: boolean;
  apiKey: boolean;
  fromEmail: boolean;
  fromDomain: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
};

const encoder = new TextEncoder();

function workerSecrets(): WorkerSecrets {
  return env as unknown as WorkerSecrets;
}

function databaseFromRuntime(): D1DatabaseLike {
  const database = (env as unknown as { DB?: D1DatabaseLike }).DB;
  if (!database) throw new Error("CMS database is not available. Configure the Sites D1 binding as DB.");
  return database;
}

function now() {
  return new Date().toISOString();
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKeyForSecret(secret: string) {
  if (secret.length < 32) throw new Error("CMS_SECRETS_NOT_CONFIGURED");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptionKey() {
  return encryptionKeyForSecret(workerSecrets().CMS_SECRETS_KEY?.trim() || "");
}

async function encryptSecretWithKey(value: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function encryptSecret(value: string) {
  return encryptSecretWithKey(value, await encryptionKey());
}

async function decryptSecretWithKey(value: string | null, key: CryptoKey) {
  if (!value) return "";
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("CMS_SECRETS_INVALID");
  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(parts[1]) }, key, base64ToBytes(parts[2]));
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error("CMS_SECRETS_INVALID");
  }
}

async function decryptSecret(value: string | null) {
  return decryptSecretWithKey(value, await encryptionKey());
}

export async function ensureIntegrationSchema(database = databaseFromRuntime()) {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_site_integrations (
      site_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'missing',
      client_id_cipher TEXT,
      client_secret_cipher TEXT,
      webhook_id_cipher TEXT,
      api_key_cipher TEXT,
      environment TEXT NOT NULL DEFAULT 'sandbox',
      from_email TEXT,
      from_domain TEXT,
      last_checked_at TEXT,
      last_error TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (site_id, provider)
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_site_integrations_status_idx ON cms_site_integrations(site_id, status)"),
  ]);
  return database;
}

async function getRow(siteId: string, provider: SiteIntegrationProvider, database?: D1DatabaseLike) {
  const db = await ensureIntegrationSchema(database);
  return db.prepare(`SELECT site_id AS siteId, provider, status, client_id_cipher AS clientIdCipher,
      client_secret_cipher AS clientSecretCipher, webhook_id_cipher AS webhookIdCipher,
      api_key_cipher AS apiKeyCipher, environment, from_email AS fromEmail, from_domain AS fromDomain,
      last_checked_at AS lastCheckedAt, last_error AS lastError, updated_by AS updatedBy,
      created_at AS createdAt, updated_at AS updatedAt
    FROM cms_site_integrations WHERE site_id = ?1 AND provider = ?2`).bind(siteId, provider).first<IntegrationRow>();
}

function normalizedEnvironment(value: string | null | undefined): "sandbox" | "live" {
  return value?.trim().toLowerCase() === "live" ? "live" : "sandbox";
}

function legacyCredentials(siteId: string, provider: SiteIntegrationProvider): SiteProviderCredentials | null {
  if (siteId !== "default") return null;
  const values = workerSecrets();
  if (provider === "paypal") {
    const clientId = values.PAYPAL_CLIENT_ID?.trim() || "";
    const clientSecret = values.PAYPAL_CLIENT_SECRET?.trim() || "";
    const webhookId = values.PAYPAL_WEBHOOK_ID?.trim() || "";
    if (!clientId && !clientSecret && !webhookId) return null;
    return { provider, source: "legacy", configured: Boolean(clientId && clientSecret && webhookId), hasEncryptionKey: true, environment: normalizedEnvironment(values.PAYPAL_ENVIRONMENT), clientId, clientSecret, webhookId, lastCheckedAt: null, lastError: null };
  }
  const apiKey = values.RESEND_API_KEY?.trim() || "";
  const fromEmail = values.RESEND_FROM_EMAIL?.trim() || "";
  if (!apiKey && !fromEmail) return null;
  return { provider, source: "legacy", configured: Boolean(apiKey && fromEmail), hasEncryptionKey: true, environment: "sandbox", apiKey, fromEmail, fromDomain: fromEmail.split("@").pop() || null, lastCheckedAt: null, lastError: null };
}

export async function getSiteProviderCredentials(siteId: string, provider: SiteIntegrationProvider, database?: D1DatabaseLike): Promise<SiteProviderCredentials> {
  const row = await getRow(siteId, provider, database);
  if (!row) return legacyCredentials(siteId, provider) || { provider, source: "missing", configured: false, hasEncryptionKey: Boolean(workerSecrets().CMS_SECRETS_KEY?.trim()), environment: "sandbox", clientId: "", clientSecret: "", webhookId: "", apiKey: "", fromEmail: "", fromDomain: null, lastCheckedAt: null, lastError: null };
  const hasEncryptionKey = Boolean(workerSecrets().CMS_SECRETS_KEY?.trim());
  if (provider === "paypal") {
    return { provider, source: "site", configured: Boolean(row.clientIdCipher && row.clientSecretCipher && row.webhookIdCipher), hasEncryptionKey, environment: normalizedEnvironment(row.environment), clientId: await decryptSecret(row.clientIdCipher), clientSecret: await decryptSecret(row.clientSecretCipher), webhookId: await decryptSecret(row.webhookIdCipher), lastCheckedAt: row.lastCheckedAt, lastError: row.lastError };
  }
  return { provider, source: "site", configured: Boolean(row.apiKeyCipher && row.fromEmail), hasEncryptionKey, environment: "sandbox", apiKey: await decryptSecret(row.apiKeyCipher), fromEmail: row.fromEmail || "", fromDomain: row.fromDomain, lastCheckedAt: row.lastCheckedAt, lastError: row.lastError };
}

export async function getSiteIntegrationStatuses(siteId: string, database?: D1DatabaseLike): Promise<SiteIntegrationStatus[]> {
  const providers: SiteIntegrationProvider[] = ["paypal", "resend"];
  const statuses: SiteIntegrationStatus[] = [];
  for (const provider of providers) {
    const row = await getRow(siteId, provider, database);
    const legacy = !row ? legacyCredentials(siteId, provider) : null;
    const source: IntegrationSource = row ? "site" : legacy ? "legacy" : "missing";
    const hasEncryptionKey = Boolean(workerSecrets().CMS_SECRETS_KEY?.trim());
    const paypal = provider === "paypal";
    let secretError: string | null = null;
    if (row) {
      try {
        if (paypal) {
          await decryptSecret(row.clientIdCipher);
          await decryptSecret(row.clientSecretCipher);
          await decryptSecret(row.webhookIdCipher);
        } else {
          await decryptSecret(row.apiKeyCipher);
        }
      } catch (error) {
        secretError = error instanceof Error ? error.message : "CMS_SECRETS_INVALID";
      }
    }
    const clientId = Boolean(row?.clientIdCipher || legacy?.clientId);
    const clientSecret = Boolean(row?.clientSecretCipher || legacy?.clientSecret);
    const webhookId = Boolean(row?.webhookIdCipher || legacy?.webhookId);
    const apiKey = Boolean(row?.apiKeyCipher || legacy?.apiKey);
    const fromEmail = Boolean(row?.fromEmail || legacy?.fromEmail);
    const configured = paypal ? clientId && clientSecret && webhookId : apiKey && fromEmail;
    statuses.push({ provider, source, status: secretError || row?.status === "error" ? "error" : configured ? "ready" : "missing", configured, hasEncryptionKey, environment: paypal ? normalizedEnvironment(row?.environment || legacy?.environment) : undefined, clientId, clientSecret, webhookId, apiKey, fromEmail, fromDomain: row?.fromDomain || legacy?.fromDomain || null, lastCheckedAt: row?.lastCheckedAt || legacy?.lastCheckedAt || null, lastError: secretError || row?.lastError || legacy?.lastError || null });
  }
  return statuses;
}

export async function getSiteIntegrationReadiness(database: D1DatabaseLike, siteId: string) {
  const statuses = await getSiteIntegrationStatuses(siteId, database);
  const paypal = statuses.find((item) => item.provider === "paypal");
  const resend = statuses.find((item) => item.provider === "resend");
  return { encryptionKey: siteId === "default" || Boolean(workerSecrets().CMS_SECRETS_KEY?.trim()), paypal: Boolean(paypal?.configured), webhook: Boolean(paypal?.webhookId), resend: Boolean(resend?.configured) };
}

export async function saveSiteIntegration(siteId: string, provider: SiteIntegrationProvider, input: { clientId?: string; clientSecret?: string; webhookId?: string; environment?: string; apiKey?: string; fromEmail?: string }, updatedBy: string, database?: D1DatabaseLike) {
  const db = await ensureIntegrationSchema(database);
  if ((workerSecrets().CMS_SECRETS_KEY?.trim() || "").length < 32) throw new Error("CMS_SECRETS_NOT_CONFIGURED");
  const existing = await getRow(siteId, provider, db);
  const timestamp = now();
  // The UI deliberately sends blank fields when a client replaces only one
  // credential. Preserve the encrypted value instead of accidentally clearing it.
  const value = (next: string | undefined, previous: string | null) => next === undefined || !next.trim() ? previous : next.trim();
  const encrypted = async (next: string | undefined, previous: string | null) => {
    if (next === undefined || !next.trim()) return previous;
    return encryptSecret(next.trim());
  };
  const clientIdCipher = provider === "paypal" ? await encrypted(input.clientId, existing?.clientIdCipher || null) : null;
  const clientSecretCipher = provider === "paypal" ? await encrypted(input.clientSecret, existing?.clientSecretCipher || null) : null;
  const webhookIdCipher = provider === "paypal" ? await encrypted(input.webhookId, existing?.webhookIdCipher || null) : null;
  const apiKeyCipher = provider === "resend" ? await encrypted(input.apiKey, existing?.apiKeyCipher || null) : null;
  const fromEmail = provider === "resend" ? value(input.fromEmail, existing?.fromEmail || null) : null;
  const environment = provider === "paypal" ? normalizedEnvironment(input.environment || existing?.environment) : "sandbox";
  const configured = provider === "paypal" ? Boolean(clientIdCipher && clientSecretCipher && webhookIdCipher) : Boolean(apiKeyCipher && fromEmail);
  await db.prepare(`INSERT INTO cms_site_integrations (site_id, provider, status, client_id_cipher, client_secret_cipher, webhook_id_cipher, api_key_cipher, environment, from_email, from_domain, last_checked_at, last_error, updated_by, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, NULL, ?11, ?12, ?12)
    ON CONFLICT(site_id, provider) DO UPDATE SET status = excluded.status, client_id_cipher = excluded.client_id_cipher, client_secret_cipher = excluded.client_secret_cipher, webhook_id_cipher = excluded.webhook_id_cipher, api_key_cipher = excluded.api_key_cipher, environment = excluded.environment, from_email = excluded.from_email, from_domain = excluded.from_domain, last_error = NULL, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(siteId, provider, configured ? "ready" : "missing", clientIdCipher, clientSecretCipher, webhookIdCipher, apiKeyCipher, environment, fromEmail, fromEmail?.split("@").pop() || null, updatedBy, existing?.createdAt || timestamp).run();
  return getSiteIntegrationStatuses(siteId, db);
}

export async function markSiteIntegrationCheck(siteId: string, provider: SiteIntegrationProvider, status: "ready" | "error" | "missing", error: string | null, database?: D1DatabaseLike) {
  const db = await ensureIntegrationSchema(database);
  await db.prepare("UPDATE cms_site_integrations SET status = ?1, last_checked_at = ?2, last_error = ?3, updated_at = ?2 WHERE site_id = ?4 AND provider = ?5").bind(status, now(), error, siteId, provider).run();
}

export async function rotateSiteIntegrationSecrets(siteId: string, oldSecret: string, updatedBy: string, database?: D1DatabaseLike) {
  const db = await ensureIntegrationSchema(database);
  const currentKey = await encryptionKey();
  const oldKey = await encryptionKeyForSecret(oldSecret.trim());
  const rows = await db.prepare(`SELECT provider, client_id_cipher AS clientIdCipher, client_secret_cipher AS clientSecretCipher,
      webhook_id_cipher AS webhookIdCipher, api_key_cipher AS apiKeyCipher FROM cms_site_integrations WHERE site_id = ?1`).bind(siteId).all<Pick<IntegrationRow, "provider" | "clientIdCipher" | "clientSecretCipher" | "webhookIdCipher" | "apiKeyCipher">>();
  let migrated = 0;
  for (const row of rows.results) {
    const decrypt = (value: string | null) => decryptSecretWithKey(value, oldKey);
    const clientIdCipher = row.clientIdCipher ? await encryptSecretWithKey(await decrypt(row.clientIdCipher), currentKey) : null;
    const clientSecretCipher = row.clientSecretCipher ? await encryptSecretWithKey(await decrypt(row.clientSecretCipher), currentKey) : null;
    const webhookIdCipher = row.webhookIdCipher ? await encryptSecretWithKey(await decrypt(row.webhookIdCipher), currentKey) : null;
    const apiKeyCipher = row.apiKeyCipher ? await encryptSecretWithKey(await decrypt(row.apiKeyCipher), currentKey) : null;
    await db.prepare(`UPDATE cms_site_integrations SET client_id_cipher = ?1, client_secret_cipher = ?2, webhook_id_cipher = ?3, api_key_cipher = ?4, updated_by = ?5, updated_at = ?6, last_error = NULL WHERE site_id = ?7 AND provider = ?8`)
      .bind(clientIdCipher, clientSecretCipher, webhookIdCipher, apiKeyCipher, updatedBy, now(), siteId, row.provider).run();
    migrated += 1;
  }
  return { siteId, migrated };
}
