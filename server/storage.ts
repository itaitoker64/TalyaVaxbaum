// File storage for videos and photos. Local disk for the pilot; the interface is small so it can
// be swapped for S3/R2 (signed URLs) or a video host later. Files are never served statically:
// every read goes through an authorized route.
import { createReadStream, createWriteStream, mkdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 300) * 1024 * 1024;
export const ALLOWED_MIME = /^(video\/(mp4|quicktime|webm)|image\/(jpeg|png|webp|heic|heif)|text\/vtt|application\/pdf)$/;

export class LocalStorage {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  private path(key: string) {
    if (!/^[a-zA-Z0-9-]+$/.test(key)) throw new Error('bad key');
    return join(this.dir, key);
  }
  /** Streams the body to disk, aborting (and removing the partial file) past `limit` bytes. */
  async write(key: string, body: ReadableStream<Uint8Array>, limit = MAX_UPLOAD_BYTES): Promise<number> {
    const target = this.path(key);
    let size = 0;
    const src = Readable.fromWeb(body as any);
    src.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) src.destroy(new Error('too_large'));
    });
    try {
      await pipeline(src, createWriteStream(target));
    } catch (e) {
      rmSync(target, { force: true });
      throw e;
    }
    return size;
  }
  size(key: string): number | null {
    try {
      return statSync(this.path(key)).size;
    } catch {
      return null;
    }
  }
  read(key: string, start?: number, end?: number) {
    return Readable.toWeb(createReadStream(this.path(key), { start, end })) as ReadableStream;
  }
  remove(key: string) {
    rmSync(this.path(key), { force: true });
  }
}
