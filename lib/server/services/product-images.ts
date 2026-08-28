import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";

const MAX_PRODUCT_IMAGE_BYTES = 6 * 1024 * 1024;
const MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export class ProductImageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ProductImageError";
  }
}

function storageRoot() {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.PRODUCT_IMAGE_STORAGE_PATH ??
      path.join(process.cwd(), "data", "product-images"),
  );
}

function assertAdmin(actor: AuthContext) {
  if (actor.role !== "ADMIN") {
    throw new ProductImageError("FORBIDDEN", "Admin access required", 403);
  }
}

function isProductImageKey(key: string) {
  return /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key);
}

function hasImageSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

async function saveProductImageFile(file: Blob) {
  const extension = MIME_TYPES.get(file.type);
  if (!extension) {
    throw new ProductImageError(
      "INVALID_IMAGE",
      "Product image must be a JPEG, PNG, or WebP file",
    );
  }
  if (file.size <= 0 || file.size > MAX_PRODUCT_IMAGE_BYTES) {
    throw new ProductImageError(
      "INVALID_IMAGE",
      "Product image must be between 1 byte and 6 MB",
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasImageSignature(bytes, file.type)) {
    throw new ProductImageError(
      "INVALID_IMAGE",
      "Product image content does not match its file type",
    );
  }

  const key = `${randomUUID()}.${extension}`;
  await mkdir(storageRoot(), { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ storageRoot(), key), bytes, {
    flag: "wx",
  });
  return { key, contentType: file.type };
}

export async function deleteStoredProductImage(key: string) {
  if (!isProductImageKey(key)) return;
  try {
    await unlink(path.join(/*turbopackIgnore: true*/ storageRoot(), key));
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}

export async function uploadProductImage(
  actor: AuthContext,
  productId: string,
  file: Blob,
) {
  assertAdmin(actor);
  const current = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, imageKey: true },
  });
  if (!current) {
    throw new ProductImageError("NOT_FOUND", "Product not found", 404);
  }

  const image = await saveProductImageFile(file);
  let updated: { id: string; updatedAt: Date };
  try {
    updated = await prisma.product.update({
      where: { id: productId },
      data: { imageKey: image.key, imageType: image.contentType },
      select: { id: true, updatedAt: true },
    });
  } catch (error) {
    await deleteStoredProductImage(image.key).catch((cleanupError) => {
      console.error("Unable to remove an unlinked product image", cleanupError);
    });
    throw error;
  }

  if (current.imageKey) {
    await deleteStoredProductImage(current.imageKey).catch((cleanupError) => {
      console.error("Unable to remove a replaced product image", cleanupError);
    });
  }
  return {
    imageUrl: `/api/products/${updated.id}/image?v=${updated.updatedAt.getTime()}`,
  };
}

export async function removeProductImage(actor: AuthContext, productId: string) {
  assertAdmin(actor);
  const current = await prisma.product.findUnique({
    where: { id: productId },
    select: { imageKey: true },
  });
  if (!current) {
    throw new ProductImageError("NOT_FOUND", "Product not found", 404);
  }

  await prisma.product.update({
    where: { id: productId },
    data: { imageKey: null, imageType: null },
  });
  if (current.imageKey) {
    await deleteStoredProductImage(current.imageKey).catch((cleanupError) => {
      console.error("Unable to remove a detached product image", cleanupError);
    });
  }
  return { imageUrl: null };
}

export async function readProductImage(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { imageKey: true, imageType: true },
  });
  if (!product?.imageKey || !product.imageType || !isProductImageKey(product.imageKey)) {
    throw new ProductImageError("NOT_FOUND", "Product image not found", 404);
  }

  return {
    contentType: product.imageType,
    body: await readFile(
      path.join(/*turbopackIgnore: true*/ storageRoot(), product.imageKey),
    ),
  };
}
