import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "recoverai.db.json");

const COLLECTIONS = [
  "customers",
  "transactions",
  "recovery_cases",
  "recovery_actions",
  "verification_records",
  "audit_logs",
  "approvals",
  "policy_config",
  "evaluation_runs",
];

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    const empty = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
    fs.writeFileSync(DATA_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function persist(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export const fileStore = {
  all(collection) {
    return load()[collection] || [];
  },
  find(collection, predicate) {
    return (load()[collection] || []).filter(predicate);
  },
  findOne(collection, predicate) {
    return (load()[collection] || []).find(predicate) || null;
  },
  insert(collection, doc) {
    const data = load();
    if (!data[collection]) data[collection] = [];
    data[collection].push(doc);
    persist(data);
    return doc;
  },
  update(collection, predicate, patch) {
    const data = load();
    const items = data[collection] || [];
    const idx = items.findIndex(predicate);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch, updated_at: new Date().toISOString() };
    persist(data);
    return items[idx];
  },
  reset() {
    const empty = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
    persist(empty);
  },
  count(collection) {
    return (load()[collection] || []).length;
  },
};

export default fileStore;
