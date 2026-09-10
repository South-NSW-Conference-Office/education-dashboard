import mongoose from "mongoose";

/**
 * One shared Mongoose connection per process. Next.js reloads modules in dev,
 * so the promise is cached on the global object to avoid connection storms.
 */
const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/snsw_dashboard";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const g = globalThis as unknown as { __snswMongo?: Cache };
const cache: Cache = g.__snswMongo ?? (g.__snswMongo = { conn: null, promise: null });

export async function db(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    mongoose.set("strictQuery", true);
    cache.promise = mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}

export async function closeDb(): Promise<void> {
  if (cache.conn) { await cache.conn.disconnect(); cache.conn = null; cache.promise = null; }
}
