import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

function getClient() {
  if (!env.s3Bucket || !env.s3Endpoint || !env.s3AccessKeyId || !env.s3SecretAccessKey) {
    const error = new Error("S3 storage configuration is missing. Configure S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY before using face enrollment or dataset downloads.");
    error.code = "S3_NOT_CONFIGURED";
    throw error;
  }

  return new S3Client({
    region: env.s3Region,
    endpoint: env.s3Endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: env.s3AccessKeyId, secretAccessKey: env.s3SecretAccessKey }
  });
}

export function putPrivateImage(key, body, contentType) {
  return getClient().send(new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" }));
}

export function getPrivateImage(key) {
  return getClient().send(new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }));
}

export function deletePrivateImage(key) {
  return getClient().send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key }));
}
