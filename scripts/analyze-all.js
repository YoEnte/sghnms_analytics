import path from "node:path";
import { fileURLToPath } from "node:url";
import { exists, listDirectories } from "../lib/fs-utils.js";
import { analyze } from "./analyze-match.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const MATCH_ROOT = path.join(ROOT, "raw", "matches");

async function main() {
  const ids = await listDirectories(MATCH_ROOT);
  let count = 0;

  for (const id of ids) {
    const dir = path.join(MATCH_ROOT, id);
    if (!(await exists(path.join(dir, "match.json")))) continue;
    if (!(await exists(path.join(dir, "events.json")))) continue;

    await analyze(id, { quiet: true });
    count += 1;
  }

  console.log(`Analyzed ${count} matches.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
