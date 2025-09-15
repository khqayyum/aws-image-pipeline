# Infrastructure — AWS Image Pipeline

This document explains how to recreate the stack for the **aws-image-pipeline** project.

## Architecture (high level)

- **S3 (bucket)**  
  - `raw/` — users upload original images (event source)  
  - `public/thumbs/` — 320×320 thumbnails  
  - `public/optimized/` — 1280×1280 optimized images
- **Lambda: `image-processor`** (S3 event trigger: `raw/*`)  
  - Validates MIME type (image/*)  
  - Resizes with Jimp → uploads variants to `public/…`  
  - Writes metadata to DynamoDB  
  - Throws on non-image (e.g., PDFs) → drives alarms/alerts
- **DynamoDB: `ImageMetadata`**  
  - Partition key: `imageId` (filename)
- **API Gateway (HTTP API):** `GET /images`, `GET /images?id={imageId}`  
  - Lambda: `image-api` (reads DynamoDB, returns JSON list/detail)
- **CloudFront CDN** (origin = S3 bucket, origin path `/public`)  
  - Public URLs:  
    - `https://<dist>.cloudfront.net/thumbs/<file>`  
    - `https://<dist>.cloudfront.net/optimized/<file>`
- **CloudWatch + SNS (email alerts)**  
  - Alarm on `image-processor` **Errors > 0** (1 min) → Topic `image-pipeline-alerts` → Email subscription

---

## Prerequisites

- AWS account (us-east-1 in this project)  
- Node.js 18+ (local only if you want to zip/deploy by CLI)  
- Permissions to create S3, Lambda, DynamoDB, API Gateway, CloudFront, CloudWatch, SNS

---

## Resources & Names (used in this repo)

- **S3 bucket:** `kaq-image-pipeline-project`  
  - Folders: `raw/`, `public/thumbs/`, `public/optimized/`
- **DynamoDB table:** `ImageMetadata` (PK `imageId` string)
- **Lambdas:**  
  - `image-processor` (`lambda/image-processor/index.js`)  
  - `image-api` (`lambda/image-api/index.js`)
- **API Gateway:** HTTP API with routes  
  - `GET /images` (list)  
  - `GET /images?id={imageId}` (single)
- **CloudFront:** origin = the S3 bucket, **Origin path** `/public`
- **SNS Topic:** `image-pipeline-alerts` (email subscribed)

---

## Lambda environment variables

For **image-processor**:
- `BUCKET_NAME` = your S3 bucket (e.g., `kaq-image-pipeline-project`)
- `TABLE_NAME` = `ImageMetadata`
- `RAW_PREFIX` = `raw/`
- `PUBLIC_PREFIX` = `public/`
- `THUMBNAIL_MAX` = `320x320`
- `OPTIMIZED_MAX` = `1280x1280`

For **image-api**:
- `TABLE_NAME` = `ImageMetadata`

---

## IAM notes (minimum)

`image-processor` execution role needs:
- `s3:GetObject`, `s3:HeadObject`, `s3:PutObject` on the bucket paths
- `dynamodb:PutItem` on `ImageMetadata`
- CloudWatch Logs permissions

`image-api` execution role needs:
- `dynamodb:Scan`, `dynamodb:GetItem`, `dynamodb:Query` on `ImageMetadata`
- CloudWatch Logs permissions

> Tip: scope S3 actions to `arn:aws:s3:::<bucket>` and `arn:aws:s3:::<bucket>/*`.

---

## Wiring events

- **S3 → image-processor**: S3 Event Notification for `PUT` on prefix `raw/` (ObjectCreated) → Lambda target.
- **CloudFront → S3**: Origin is the same bucket, **Origin path** `/public`. Keep default cache policy or enable long-TTL static caching.

---

## Manual test flow

1. **Upload an image** to `s3://<bucket>/raw/ss.png`.
2. Lambda `image-processor` runs → writes:
   - `public/thumbs/ss.png`
   - `public/optimized/ss.png`
   - DynamoDB item (`imageId = ss.png`)
3. **List API**:  
