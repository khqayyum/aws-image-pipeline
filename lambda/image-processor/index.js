const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const ddb = new AWS.DynamoDB.DocumentClient();
const Jimp = require('jimp');   // using CJS-compatible version

const BUCKET = process.env.BUCKET_NAME;
const TABLE  = process.env.TABLE_NAME;
const RAW_PREFIX = process.env.RAW_PREFIX || 'raw/';
const PUBLIC_PREFIX = process.env.PUBLIC_PREFIX || 'public/';
const THUMB_MAX = process.env.THUMBNAIL_MAX || '320x320';
const OPT_MAX   = process.env.OPTIMIZED_MAX || '1280x1280';

function parseMax(s) {
  const [w, h] = s.toLowerCase().split('x').map(Number);
  return { w, h };
}
function filenameFromKey(key) { return key.split('/').pop(); }
function variantKey(filename, variant) { return `${PUBLIC_PREFIX}${variant}/${filename}`; }

async function putVariant(buffer, key, mime) {
  await s3.putObject({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mime || 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable'
  }).promise();
  return key;
}

async function resizeToMax(img, maxW, maxH, quality = 85) {
  const clone = img.clone();
  clone.contain(maxW, maxH, Jimp.RESIZE_BILINEAR);
  if (clone.getMIME() === Jimp.MIME_JPEG) clone.quality(quality);
  return await clone.getBufferAsync(clone.getMIME());
}

exports.handler = async (event) => {
  const thumb = parseMax(THUMB_MAX);
  const opt   = parseMax(OPT_MAX);

  const results = [];

  for (const record of (event.Records || [])) {
    const bucket = record.s3.bucket.name;
    const key    = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    if (!key.startsWith(RAW_PREFIX)) continue;

    const filename = filenameFromKey(key);

    // checking content type before downloading
    const head = await s3.headObject({ Bucket: bucket, Key: key }).promise();
    const ct = (head.ContentType || '').toLowerCase();
    
    if (!ct.startsWith('image/')) {
      console.error(`Unsupported file type uploaded: ${key} (${ct})`);
      throw new Error(`Unsupported MIME type: ${ct}`);
      
    }

    // download original
    const obj = await s3.getObject({ Bucket: bucket, Key: key }).promise();
    const img = await Jimp.read(obj.Body);
    const origW = img.bitmap.width;
    const origH = img.bitmap.height;
    const mime  = img.getMIME(); 

    // creating variants
    const thumbBuf = await resizeToMax(img, thumb.w, thumb.h);
    const optBuf   = await resizeToMax(img, opt.w, opt.h);

    const thumbKey = variantKey(filename, 'thumbs');
    const optKey   = variantKey(filename, 'optimized');

    await putVariant(thumbBuf, thumbKey, Jimp.MIME_JPEG);
    await putVariant(optBuf,   optKey,   Jimp.MIME_JPEG);

    // writing metadata to DynamoDB
    const now = new Date().toISOString();
    const item = {
      imageId: filename,
      filename,
      uploadedAt: now,
      original: {
        bucket: bucket,
        key: key,
        bytes: obj.Body.length,
        width: origW,
        height: origH,
        mime: mime
      },
      variants: {
        thumbnail: { key: thumbKey },
        optimized: { key: optKey }
      }
    };

    await ddb.put({ TableName: TABLE, Item: item }).promise();
    results.push({ imageId: filename, thumbKey, optKey });
  }

  return { statusCode: 200, body: JSON.stringify({ processed: results }) };
};


