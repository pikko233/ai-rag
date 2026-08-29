import "server-only";

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getStorageConfig() {
  const config = {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "auto",
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  };

  if (
    !config.endpoint ||
    !config.bucket ||
    !config.accessKeyId ||
    !config.secretAccessKey
  ) {
    throw new Error("对象存储尚未配置完整");
  }

  return {
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  };
}

function getClient() {
  const config = getStorageConfig();
  return {
    bucket: config.bucket,
    client: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    }),
  };
}

export async function createUploadUrl(input: {
  objectKey: string;
  contentType: string;
  checksum: string;
}) {
  const { client, bucket } = getClient();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.objectKey,
    ContentType: input.contentType,
    Metadata: { sha256: input.checksum },
  });

  return getSignedUrl(client, command, {
    expiresIn: 10 * 60,
    // 强制元数据留在请求头中，避免 R2 因重复签名参数拒绝上传。
    unhoistableHeaders: new Set(["x-amz-meta-sha256"]),
  });
}

export async function createDownloadUrl(objectKey: string) {
  const { client, bucket } = getClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
    { expiresIn: 5 * 60 },
  );
}

export async function readObjectMetadata(objectKey: string) {
  const { client, bucket } = getClient();
  return client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
}

export async function readObjectBytes(objectKey: string) {
  const { client, bucket } = getClient();
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
  );
  if (!response.Body) throw new Error("文件内容为空");
  return response.Body.transformToByteArray();
}
