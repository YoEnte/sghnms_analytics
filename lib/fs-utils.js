import fs from "node:fs/promises";
import path from "node:path";

export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function listDirectories(parent) {
  if (!(await exists(parent))) return [];
  const entries = await fs.readdir(parent, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
