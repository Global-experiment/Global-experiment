import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

/**
 * File storage (docs/architecture/overview.md §3.4): Treasury supporting
 * documents are the only uploads in v0.1. The database stores an opaque
 * `storage_key`, never a path, so an S3-compatible adapter can replace the
 * local disk later without a schema change.
 */
export const FILE_STORAGE = Symbol("FILE_STORAGE");

export interface FileStorage {
  /** Stores the bytes under their SHA-256 (content-addressed: the same file is stored once). */
  put(bytes: Buffer): Promise<{ key: string; sha256: string }>;
  get(key: string): Promise<Buffer>;
  /** Removes the stored file; a missing file is not an error. */
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const KEY = /^sha256\/[0-9a-f]{2}\/[0-9a-f]{64}$/;

export const sha256Hex = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export const storageKeyFor = (sha256: string) => `sha256/${sha256.slice(0, 2)}/${sha256}`;

/**
 * Local disk under one private directory (production
 * /var/lib/global-experiment/files: outside every web root, owned by the API
 * user, in the backup). Files are written to a temporary name and renamed,
 * so a crash never leaves half a file under a real key; keys are checked so
 * no key can point outside the directory.
 */
export class LocalDiskStorage implements FileStorage {
  private readonly root: string;

  constructor(directory: string) {
    this.root = isAbsolute(directory) ? directory : resolve(process.cwd(), directory);
  }

  private path(key: string): string {
    if (!KEY.test(key)) throw new Error("Invalid storage key.");
    const path = join(this.root, ...key.split("/"));
    if (!path.startsWith(this.root + sep)) throw new Error("Invalid storage key.");
    return path;
  }

  async put(bytes: Buffer): Promise<{ key: string; sha256: string }> {
    const sha256 = sha256Hex(bytes);
    const key = storageKeyFor(sha256);
    const path = this.path(key);
    if (await this.exists(key)) return { key, sha256 };
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.part`;
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
    return { key, sha256 };
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.path(key))).isFile();
    } catch {
      return false;
    }
  }
}

/**
 * The real type of an upload, from its first bytes (never the name or the
 * browser's Content-Type): PDF, PNG or JPEG, else null.
 */
export function sniffContentType(bytes: Buffer): "application/pdf" | "image/png" | "image/jpeg" | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}
