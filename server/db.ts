import neo4j, { Driver, Session } from "neo4j-driver";

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USER ?? "cognodb";
const password = process.env.NEO4J_PASSWORD;

let driver: Driver | null = null;

export function isConfigured(): boolean {
  return Boolean(uri && password);
}

export function getDriver(): Driver {
  if (!isConfigured()) {
    throw new DbConfigError(
      "Missing NEO4J_URI or NEO4J_PASSWORD. Copy .env.example to .env and add your CognoDB credentials."
    );
  }
  if (!driver) {
    driver = neo4j.driver(uri!, neo4j.auth.basic(user, password!), {
      maxConnectionPoolSize: 20,
      connectionAcquisitionTimeout: 15_000,
      connectionTimeout: 15_000,
    });
  }
  return driver;
}

export async function withSession<T>(work: (session: Session) => Promise<T>): Promise<T> {
  const session = getDriver().session();
  try {
    return await work(session);
  } finally {
    await session.close();
  }
}

export async function verifyConnectivity(): Promise<void> {
  await getDriver().verifyConnectivity();
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export class DbConfigError extends Error {
  code = "DB_CONFIG" as const;
}

export class DbUnavailableError extends Error {
  code = "DB_UNAVAILABLE" as const;
  constructor(cause?: unknown) {
    super("The kitchen graph is unreachable. Check that your CognoDB instance is running.");
    this.cause = cause;
  }
}

export function wrapDbError(err: unknown): never {
  if (err instanceof DbConfigError || err instanceof DbUnavailableError) throw err;
  const message = err instanceof Error ? err.message : String(err);
  const unavailable =
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Failed to connect|ServiceUnavailable|SessionExpired|N\/A/i.test(
      message
    );
  if (unavailable) throw new DbUnavailableError(err);
  throw err;
}
