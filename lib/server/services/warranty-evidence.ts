import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_BYTES = 6 * 1024 * 1024;
const TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

function root() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.WARRANTY_STORAGE_PATH ?? path.join(process.cwd(), "data", "warranty-evidence"));
}

export async function saveWarrantyEvidence(file: File) {
  const extension = TYPES.get(file.type);
  if (!extension) throw new Error("Warranty evidence must be a JPEG, PNG, or WebP image");
  if (file.size < 1 || file.size > MAX_BYTES) throw new Error("Warranty evidence must be between 1 byte and 6 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid = file.type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.type === "image/png" ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
      : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (!valid) throw new Error("Warranty evidence content does not match its image type");
  const key = `${randomUUID()}.${extension}`;
  await mkdir(root(), { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ root(), key), bytes, { flag: "wx" });
  return { key, contentType: file.type, fileName: file.name.slice(0, 255) || `evidence.${extension}` };
}

export async function readWarrantyEvidence(key: string) {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) throw new Error("Invalid warranty evidence key");
  return { body: await readFile(path.join(/*turbopackIgnore: true*/ root(), key)), contentType: key.endsWith(".jpg") ? "image/jpeg" : key.endsWith(".png") ? "image/png" : "image/webp" };
}

export async function removeWarrantyEvidence(key: string) {
  try { await unlink(path.join(/*turbopackIgnore: true*/ root(), key)); } catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
}
