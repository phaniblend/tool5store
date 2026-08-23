import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage is intentionally generic S3-compatible, not tied to one
 * vendor's SDK — set S3_ENDPOINT to point it at Cloudflare R2, MinIO, or
 * any other S3-compatible bucket. Leave S3_ENDPOINT unset to talk to real
 * AWS S3. R2 is a good fit for a "$5/month" budget: no egress fees and a
 * 10GB/month free tier.
 *
 * If no bucket is configured at all (S3_BUCKET unset), falls back to
 * writing the artifact to local disk and returning a file:// path — lets
 * the render pipeline be exercised end-to-end without cloud credentials.
 * Not meant for production use.
 */

const SIGNED_URL_EXPIRY_SECONDS = Number(process.env.SIGNED_URL_EXPIRY_SECONDS ?? 3600);

export interface UploadResult {
  url: string;
  expiresAt: string | null; // null for the local fallback (no expiry)
}

function s3ClientFromEnv(): S3Client | null {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;

  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
}

async function uploadToLocalFallback(localPath: string, key: string): Promise<UploadResult> {
  const outDir = path.join(os.tmpdir(), "video-api-output");
  await mkdir(outDir, { recursive: true });
  const dest = path.join(outDir, key.replace(/\//g, "_"));
  await copyFile(localPath, dest);
  return { url: `file://${dest}`, expiresAt: null };
}

/**
 * Uploads the rendered file at `localPath` under `key` and returns a
 * signed (or local) URL to fetch it. Does NOT delete `localPath` — caller
 * is responsible for wiping the job's tmp dir afterward.
 */
export async function uploadArtifact(localPath: string, key: string): Promise<UploadResult> {
  const client = s3ClientFromEnv();
  const bucket = process.env.S3_BUCKET;

  if (!client || !bucket) {
    return uploadToLocalFallback(localPath, key);
  }

  const body = await readFile(localPath);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "video/mp4",
    }),
  );

  const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: SIGNED_URL_EXPIRY_SECONDS,
  });

  return {
    url,
    expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString(),
  };
}
