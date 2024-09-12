import { S3Client } from "@aws-sdk/client-s3";

var s3Client;
var use_s3;

function init(should_use_s3) {
  use_s3 = should_use_s3;
}

// Singleton pattern
function getS3Client() {
  if(!s3Client) {
    if (!process.env.s3_accessKeyId || !process.env.s3_secretAccessKey) {
      throw new Error("AWS access key and secret key must be defined in environment variables");
    }
    s3Client = new S3Client({
      region: process.env.aws_region,
      credentials: {
        accessKeyId: process.env.s3_accessKeyId,
        secretAccessKey: process.env.s3_secretAccessKey
      }
    });
  }
  return s3Client
}

function shouldUseS3() {
  return use_s3;
}

export {
  getS3Client,
  shouldUseS3,
  init
}