import { resolvePlatformApplicationAccess } from "../../../application-access";
import { getMediaBucket } from "../../../../../../db/cms";
import { getPlatformApplicationAsset } from "../../../../../../db/v32";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId") || "";
  if (!applicationId) return new Response("Not found", { status: 404 });
  const access = await resolvePlatformApplicationAccess(applicationId, url.searchParams.get("token"));
  if (!access) return new Response("Forbidden", { status: 403 });
  const asset = await getPlatformApplicationAsset(assetId, applicationId);
  if (!asset?.objectKey) return new Response("Not found", { status: 404 });
  const object = await getMediaBucket().get(asset.objectKey) as { body?: ReadableStream; httpMetadata?: { contentType?: string } } | null;
  if (!object?.body) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || asset.mimeType, "Cache-Control": "public, max-age=31536000, immutable" } });
}
