/**
 * Seed — load the four finance boards and the weekly databoard from seed-data/*.js
 * as version 1 APPROVED per unit and one PUBLISHED week.
 *   npm run seed           add/refresh (boards become a new approved version if one exists)
 *   npm run seed:reset     drop the database first
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import mongoose from "mongoose";
import { db, closeDb } from "../src/lib/db";
import { OperatingUnitModel } from "../src/models";
import type { BoardDocument, DataboardDocument } from "../src/domain/types";
import { saveBoardDocument } from "../src/services/financeWrite";
import { saveBoard } from "../src/services/databoard";
import { getOrg } from "../src/services/structure";

const DATA_DIR = path.resolve(__dirname, "../seed-data");
const DATA_FILES = ["schools.js", "databoard.js", "finance-bcc.js", "finance-ncs.js", "finance-ccs.js", "finance-ccs-elc.js"];

function loadDataFiles(): { schools: Array<Record<string, string>>; finance: Record<string, BoardDocument>; databoard: DataboardDocument } {
  const missing = DATA_FILES.filter((f) => !fs.existsSync(path.join(DATA_DIR, f)));
  if (missing.length) {
    throw new Error(
      `seed-data is missing ${missing.join(", ")}.\n` +
        "The board files hold real school figures, so they are not in this repository — they come with the\n" +
        "data handover, alongside a mongosh snapshot you can restore instead of seeding. See backend/README.md.",
    );
  }
  const w: Record<string, unknown> = {};
  for (const f of DATA_FILES) {
    vm.runInNewContext(fs.readFileSync(path.join(DATA_DIR, f), "utf8"), { window: w });
  }
  const data = w.SNSW_DATA as { finance: Record<string, BoardDocument>; databoard: DataboardDocument };
  return { schools: w.SNSW_SCHOOLS as Array<Record<string, string>>, finance: data.finance, databoard: data.databoard };
}

async function main() {
  const reset = process.argv.includes("--reset");
  await db();
  if (reset) { console.log("Dropping database", mongoose.connection.name); await mongoose.connection.dropDatabase(); }
  const org = await getOrg();
  const { schools, finance, databoard } = loadDataFiles();

  const TYPE: Record<string, string> = { "ccs-elc": "EARLY_LEARNING_CENTRE" };
  for (const [i, s] of schools.entries()) {
    await OperatingUnitModel.updateOne(
      { organisationId: org._id, code: s.id },
      { $set: { name: s.name, shortName: s.short, unitType: TYPE[s.id] ?? "SCHOOL", location: s.loc, colourHex: s.colour, databoardKey: s.dbKey, displayOrder: i } },
      { upsert: true },
    );
  }
  console.log(`Units: ${schools.map((s) => s.id).join(", ")}`);

  for (const [code, doc] of Object.entries(finance)) {
    const { version, warnings } = await saveBoardDocument(code, doc, { publish: true, copyFrom: "none", isPlaceholder: !!doc.meta.draft, actor: "seed", reportedTotals: "replace" });
    console.log(`Finance ${code.padEnd(8)} ${doc.meta.asAt.padEnd(11)} → v${version.versionNo} ${version.status}${version.isPlaceholder ? " (placeholder)" : ""}${warnings.length ? `\n   warnings: ${warnings.join("; ")}` : ""}`);
  }

  const saved = await saveBoard(databoard as never, { publish: true });
  console.log(`Databoard week ending ${saved.weekEndingLabel} → ${saved.status}`);
  await closeDb();
}

main().catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
