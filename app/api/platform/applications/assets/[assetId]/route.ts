import { resolvePlatformApplicationAccess } from "../../../application-access";
import { getMediaBucket } from "../../../../../../db/cms";
import { getPlatformApplicationAsset, updatePlatformApplicationAsset } from "../../../../../../db/v32";

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

export async function PATCH(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const { assetId } = await params;
    const payload = await request.json().catch(() => ({})) as { applicationId?: string; token?: string; assetKey?: string; kind?: string; alt?: string | null };
    if (!payload.applicationId) return Response.json({ error: "Application id is required.", code: "PLATFORM_ASSET_ERROR" }, { status: 400 });
    const access = await resolvePlatformApplicationAccess(payload.applicationId, payload.token || null);
    if (!access) return Response.json({ error: "You do not have access to this application.", code: "FORBIDDEN" }, { status: 403 });
    const asset = await updatePlatformApplicationAsset(payload.applicationId, assetId, { assetKey: payload.assetKey, kind: payload.kind, alt: payload.alt }, access.actor);
    return Response.json({ asset }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update the asset binding.";
    const status = message === "ASSET_NOT_FOUND" ? 404 : 400;
    return Response.json({ error: message === "INVALID_ASSET_BINDING" ? "Add a binding key before saving." : message, code: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
