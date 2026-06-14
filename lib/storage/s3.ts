import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getServerEnv } from "@/lib/env";

function clients() {
  const env = getServerEnv();
  const credentials = {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  };
  return {
    bucket: env.S3_BUCKET,
    storageClient: new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      credentials,
      forcePathStyle: true,
    }),
    signingClient: new S3Client({
      endpoint: env.S3_PUBLIC_ENDPOINT,
      region: env.S3_REGION,
      credentials,
      forcePathStyle: true,
    }),
  };
}

export async function createDirectUploadUrl(input: {
  storageKey: string;
  mimeType: string;
  checksum: string;
}) {
  const { bucket, signingClient } = clients();
  return getSignedUrl(
    signingClient,
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.storageKey,
      ContentType: input.mimeType,
      Metadata: { checksum: input.checksum },
    }),
    { expiresIn: 10 * 60 },
  );
}

export async function inspectStoredObject(storageKey: string) {
  const { bucket, storageClient } = clients();
  return storageClient.send(
    new HeadObjectCommand({ Bucket: bucket, Key: storageKey }),
  );
}

export async function createDownloadUrl(storageKey: string, filename: string) {
  const { bucket, signingClient } = clients();
  return getSignedUrl(
    signingClient,
    new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      ResponseContentDisposition: `attachment; filename="${filename.replace(/["\r\n]/g, "_")}"`,
    }),
    { expiresIn: 5 * 60 },
  );
}

export async function deleteStoredObject(storageKey: string) {
  const { bucket, storageClient } = clients();
  await storageClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
}
