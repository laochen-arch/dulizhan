import { deleteAsset, getMediaBucket, insertAsset, listAssets } from "../../../../db/cms";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    return Response.json({ assets: await listAssets(siteId, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const siteId = getSiteId(request, formData.get("siteId"));
    const access = await requireMember(siteId, "editor");
    const file = formData.get("file");
    if (!(file instanceof File) || !file.type.startsWith("image/")) return Response.json({ error: "Upload an image file.", code: "INVALID_ASSET" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return Response.json({ error: "Images must be smaller than 10 MB.", code: "ASSET_TOO_LARGE" }, { status: 400 });
    const assetId = `asset_${crypto.randomUUID()}`;
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-80) || "image";
    const objectKey = `sites/${siteId}/assets/${assetId}-${safeName}`;
    await getMediaBucket().put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
    const asset = await insertAsset({ id: assetId, siteId, assetKey: safeName, kind: String(formData.get("kind") || "image"), url: `/api/cms/assets/${assetId}?siteId=${encodeURIComponent(siteId)}`, objectKey, alt: String(formData.get("alt") || ""), mimeType: file.type, sizeBytes: file.size, createdAt: new Date().toISOString(), createdBy: access.user.userId });
    return Response.json({ asset }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const assetId = url.searchParams.get("assetId");
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "editor");
    if (!assetId) return Response.json({ error: "assetId is required.", code: "INVALID_ASSET" }, { status: 400 });
    const asset = await deleteAsset(assetId, siteId, access.user.userId, access.user.email);
    if (asset.objectKey) await getMediaBucket().delete(asset.objectKey);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
