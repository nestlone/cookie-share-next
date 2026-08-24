import { BUCKET_FILE_FORMAT, BUCKET_FILE_VERSION } from "../shared/constants.js";
import { isEnvelope } from "./envelope.js";

export function createBucketFile(envelope, exportedAt = new Date().toISOString()) {
  if (!isEnvelope(envelope)) {
    throw new Error("Invalid encrypted bucket");
  }
  return {
    format: BUCKET_FILE_FORMAT,
    version: BUCKET_FILE_VERSION,
    exportedAt,
    envelope,
  };
}

export function parseBucketFile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid bucket file");
  }

  const file = value;
  if (
    file.format !== BUCKET_FILE_FORMAT ||
    file.version !== BUCKET_FILE_VERSION ||
    typeof file.exportedAt !== "string" ||
    Number.isNaN(new Date(file.exportedAt).getTime()) ||
    !isEnvelope(file.envelope)
  ) {
    throw new Error("Invalid bucket file");
  }

  return file;
}
