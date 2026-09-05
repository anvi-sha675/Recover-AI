import { fileStore } from "./fileStore.js";import { mongoStore, connectMongo } from "./mongoStore.js";

let backend = null; // "mongo" | "file"
let readyPromise = null;

async function resolveBackend() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const uri = process.env.MONGODB_URI;
    const isProduction = process.env.NODE_ENV === "production";

    if (!uri) {
      if (isProduction) {
        throw new Error(
          "[db] FATAL: NODE_ENV=production but MONGODB_URI is not set. " +
          "Refusing to silently start in DEMO/LOCAL SIMULATION MODE in production."
        );
      }
      console.log("[db] MONGODB_URI not set - using file-backed store (DEMO / LOCAL SIMULATION MODE).");
      backend = "file";
      return;
    }
    try {
      await connectMongo(uri, 4000);
      console.log("[db] Connected to MongoDB - using real MongoDB store.");
      backend = "mongo";
    } catch (err) {
      if (isProduction) {
        throw new Error(
          `[db] FATAL: NODE_ENV=production and MongoDB connection failed (${err.message}). ` +
          "Refusing to silently fall back to DEMO/LOCAL SIMULATION MODE in production."
        );
      }
      console.warn(
        `[db] MONGODB_URI was set but connection failed (${err.message}). ` +
        `Falling back to the file-backed store (DEMO / LOCAL SIMULATION MODE). This is logged, not hidden.`
      );
      backend = "file";
    }
  })();

  return readyPromise;
}

async function active() {
  await resolveBackend();
  return backend === "mongo" ? mongoStore : fileStore;
}

export async function getBackendName() {
  await resolveBackend();
  return backend;
}

const db = {
  async all(collection) {
    return (await active()).all(collection);
  },
  async find(collection, predicate) {
    return (await active()).find(collection, predicate);
  },
  async findOne(collection, predicate) {
    return (await active()).findOne(collection, predicate);
  },
  async insert(collection, doc) {
    return (await active()).insert(collection, doc);
  },
  async update(collection, predicate, patch) {
    return (await active()).update(collection, predicate, patch);
  },
  async reset() {
    return (await active()).reset();
  },
  async count(collection) {
    return (await active()).count(collection);
  },
};

export default db;
