import { resolvePlatformApplicationAccess } from "../../application-access";
import { getMediaBucket } from "../../../../../db/cms";
import { insertPlatformApplicationAsset, listPlatformApplicationAssets } from "../../../../../db/v32";
import { isSupportedImageType } from "../../../media-validation";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status = 400, code = "PLATFORM_ASSET_ERROR") {
  return Response.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId");
  if (!applicationId) return errorResponse("Application id is required.");
  const access = await resolvePlatformApplicationAccess(applicationId, url.searchParams.get("token"));
  if (!access) return errorResponse("You do not have access to this application.", 403, "FORBIDDEN");
  return Response.json({ assets: await listPlatformApplicationAssets(applicationId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const applicationId = String(formData.get("applicationId") || "");
    const token = String(formData.get("token") || "") || null;
    if (!applicationId) return errorResponse("Application id is required.");
    const access = await resolvePlatformApplicationAccess(applicationId, token);
    if (!access) return errorResponse("You do not have access to this application.", 403, "FORBIDDEN");
    const file = formData.get("file");
    if (!(file instanceof File) || !isSupportedImageType(file.type)) return errorResponse("Upload a JPG, PNG, WebP, GIF or AVIF image.", 400, "INVALID_ASSET");
    if (file.size > 10 * 1024 * 1024) return errorResponse("Images must be smaller than 10 MB.", 400, "ASSET_TOO_LARGE");
    const assetId = `platform_asset_${crypto.randomUUID()}`;
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-80) || "image";
    const objectKey = `platform/applications/${applicationId}/${assetId}-${safeName}`;
    await getMediaBucket().put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type, cacheControl: "private, no-store" } });
    const asset = await insertPlatformApplicationAsset({
      id: assetId,
      applicationId,
      assetKey: String(formData.get("assetKey") || safeName).trim().slice(0, 120) || safeName,
      kind: String(formData.get("kind") || "general").trim().slice(0, 40) || "general",
      url: `/api/platform/applications/assets/${assetId}?applicationId=${encodeURIComponent(applicationId)}`,
      objectKey,
      alt: String(formData.get("alt") || "").trim().slice(0, 240) || null,
      mimeType: file.type,
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
      createdBy: access.actor.userId,
    });
    return Response.json({ asset }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to upload the image.", 400);
  }
}
