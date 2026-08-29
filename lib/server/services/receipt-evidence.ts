import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_RECEIPT_BYTES = 6 * 1024 * 1024;
const MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function storageRoot() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.RECEIPT_STORAGE_PATH ?? path.join(process.cwd(), "data", "receipt-photos"));
}

export async function saveReceiptEvidence(file: Blob & { name?: string }) {
  const extension = MIME_TYPES.get(file.type);
  if (!extension) throw new Error("Receipt evidence must be a JPEG, PNG, or WebP image");
  if (file.size <= 0 || file.size > MAX_RECEIPT_BYTES) throw new Error("Receipt evidence must be between 1 byte and 6 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasImageSignature(bytes, file.type)) throw new Error("Receipt evidence content does not match its image type");
  const key = `${randomUUID()}.${extension}`;
  await mkdir(storageRoot(), { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ storageRoot(), key), bytes, { flag: "wx" });
  return { key, contentType: file.type };
}

function hasImageSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

export async function readReceiptEvidence(key: string) {
  if (!isReceiptEvidenceKey(key)) throw new Error("Invalid receipt evidence key");
  const contentType = key.endsWith(".jpg") ? "image/jpeg" : key.endsWith(".png") ? "image/png" : "image/webp";
  return { contentType, body: await readFile(path.join(/*turbopackIgnore: true*/ storageRoot(), key)) };
}

export async function removeReceiptEvidence(key: string) {
  if (!isReceiptEvidenceKey(key)) throw new Error("Invalid receipt evidence key");
  await unlink(path.join(/*turbopackIgnore: true*/ storageRoot(), key));
}

export function isReceiptEvidenceKey(key: string) {
  return /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key);
}
