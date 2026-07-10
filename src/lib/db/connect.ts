import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI ?? "";
const MONGODB_URI_FALLBACK = process.env.MONGODB_URI_FALLBACK ?? "";

type MongoConnectMode = "auto" | "primary" | "fallback";

function parseConnectMode(value: string | undefined): MongoConnectMode {
  const normalized = (value ?? "auto").trim().toLowerCase();

  if (normalized === "primary" || normalized === "fallback") {
    return normalized;
  }

  return "auto";
}

const MONGODB_CONNECT_MODE = parseConnectMode(process.env.MONGODB_CONNECT_MODE);

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

if (!global.mongooseCache) {
  global.mongooseCache = cache;
}

function isSrvOrNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return (
    message.includes("querySrv") ||
    message.includes("ESERVFAIL") ||
    message.includes("ETIMEOUT") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED")
  );
}

async function connectPrimary(): Promise<typeof mongoose> {
  return mongoose.connect(MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 10000,
  });
}

async function connectFallback(): Promise<typeof mongoose> {
  if (!MONGODB_URI_FALLBACK) {
    throw new Error(
      "MONGODB_CONNECT_MODE=fallback requires MONGODB_URI_FALLBACK.",
    );
  }

  return mongoose.connect(MONGODB_URI_FALLBACK, {
    dbName: process.env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 10000,
    tls: true,
  });
}

async function connectWithRetry(): Promise<typeof mongoose> {
  if (MONGODB_CONNECT_MODE === "fallback") {
    return connectFallback();
  }

  if (MONGODB_CONNECT_MODE === "primary") {
    return connectPrimary();
  }

  try {
    return await connectPrimary();
  } catch (error) {
    if (!isSrvOrNetworkError(error)) {
      throw error;
    }

    if (!MONGODB_URI_FALLBACK) {
      throw new Error(
        "MongoDB SRV/network lookup failed and no MONGODB_URI_FALLBACK is configured.",
      );
    }

    return connectFallback();
  }
}

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is required.");
  }

  if (cache.conn) {
    return cache.conn;
  }

  if (!cache.promise) {
    cache.promise = connectWithRetry();
  }

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }

  return cache.conn;
}