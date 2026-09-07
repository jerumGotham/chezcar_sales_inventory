import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 6 * 1024 * 1024;
const TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["application/pdf", "pdf"]]);
function root() { return path.resolve(/*turbopackIgnore: true*/ process.env.SUPPLIER_CLAIM_STORAGE_PATH ?? path.join(process.cwd(), "data", "supplier-claim-evidence")); }

export async function saveSupplierClaimEvidence(file: File) {
  const extension = TYPES.get(file.type);
  if (!extension || file.size < 1 || file.size > MAX_BYTES) throw new Error("Evidence must be a JPEG, PNG, WebP, or PDF up to 6 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const imageValid = file.type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.type === "image/png" ? [0x89, 0x50, 0x4e, 0x47].every((value, index) => bytes[index] === value)
      : file.type === "image/webp" ? bytes[0] === 0x52 && bytes[8] === 0x57 : bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (!imageValid) throw new Error("Evidence content does not match its file type");
  const key = `${randomUUID()}.${extension}`;
  await mkdir(root(), { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ root(), key), bytes, { flag: "wx" });
  return { key, contentType: file.type, fileName: file.name.slice(0, 255) || `evidence.${extension}`, size: file.size };
}

export async function readSupplierClaimEvidence(key: string) {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(key)) throw new Error("Invalid evidence key");
  const extension = key.split(".").at(-1);
  const contentType = extension === "jpg" ? "image/jpeg" : extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "application/pdf";
  return { body: await readFile(path.join(/*turbopackIgnore: true*/ root(), key)), contentType };
}

export async function removeSupplierClaimEvidence(key: string) {
  try { await unlink(path.join(/*turbopackIgnore: true*/ root(), key)); } catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
}
