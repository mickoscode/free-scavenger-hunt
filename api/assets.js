// Map images. Public files served by CloudFront from /assets/* (never anything secret). S3 in production, memory in tests.
export function createMemoryAssets() {
  const files = new Map();
  return {
    files,
    async put(key, bytes, contentType) { files.set(key, { bytes, contentType }); },
    async delete(key) { files.delete(key); },
    async copy(from, to) { files.set(to, files.get(from)); },
    async deletePrefix(prefix) { for (const k of [...files.keys()]) if (k.startsWith(prefix)) files.delete(k); },
  };
}

export async function createS3Assets({ bucket }) {
  const { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({});
  return {
    async put(key, bytes, contentType) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }));
    },
    async delete(key) { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); },
    async copy(from, to) { await s3.send(new CopyObjectCommand({ Bucket: bucket, Key: to, CopySource: `${bucket}/${from}`, MetadataDirective: 'COPY' })); },
    async deletePrefix(prefix) {
      let token;
      do {
        const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        if (r.Contents?.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: r.Contents.map((o) => ({ Key: o.Key })) } }));
        token = r.NextContinuationToken;
      } while (token);
    },
  };
}
