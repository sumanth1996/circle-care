// npm run db:migrate — apply pending migrations to DATABASE_URL (or the embedded dev database).
import { loadConfig } from "../config";
import { openDb } from "../db";
import { migrate } from "../migrate";

const cfg = loadConfig();
const db = await openDb(cfg);
const applied = await migrate(db);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
await db.close();
