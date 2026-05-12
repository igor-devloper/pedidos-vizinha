import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath: string) {
  await mkdir(dirPath, { recursive: true });
}

export async function ensureParent(filePath: string) {
  await ensureDir(path.dirname(filePath));
}

export async function writeJson<T>(filePath: string, payload: T) {
  await ensureParent(filePath);
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

export async function removeDir(dirPath: string) {
  await rm(dirPath, { recursive: true, force: true });
}

export async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}
