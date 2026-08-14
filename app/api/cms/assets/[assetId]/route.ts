import { readAsset, getMediaBucket } from "../../../../../db/cms";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    const { assetId } = await context.params;
    const asset = await readAsset(assetId);
    if (!asset?.objectKey) return new Response("Not found", { status: 404 });
    const object = await getMediaBucket().get(asset.objectKey) as { body?: ReadableStream; httpMetadata?: { contentType?: string } } | null;
    if (!object?.body) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || asset.mimeType, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("Media unavailable", { status: 503 });
  }
}
