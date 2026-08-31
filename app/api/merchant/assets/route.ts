import { getMediaBucket, insertAsset, listAssets } from "../../../../db/cms";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";
import { isSupportedImageType } from "../../media-validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const access = await requireMerchantCapability(request, "products.write", form.get("siteId"));
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || !isSupportedImageType(file.type)) return Response.json({error:"请选择 JPG、PNG、WebP、GIF 或 AVIF 图片。"},{status:400});
    if(file.size>10*1024*1024)return Response.json({error:"图片不能超过 10MB。"},{status:400});
    const id = `asset_${crypto.randomUUID()}`;
    const name = file.name.toLowerCase().replace(/[^a-z0-9.]+/g,"-").slice(-80)||"image";
    const siteId=access.site.id,objectKey=`sites/${siteId}/assets/${id}-${name}`;
    const bucket=getMediaBucket();
    await bucket.put(objectKey,await file.arrayBuffer(),{httpMetadata:{contentType:file.type,cacheControl:"public, max-age=31536000, immutable"}});
    try {
      const asset=await insertAsset({id,siteId,assetKey:name,kind:"product",url:`/api/cms/assets/${id}?siteId=${encodeURIComponent(siteId)}`,objectKey,alt:String(form.get("alt")||""),mimeType:file.type,sizeBytes:file.size,createdAt:new Date().toISOString(),createdBy:access.user!.userId});
      return Response.json({asset},{status:201,headers:{"Cache-Control":"no-store"}});
    }catch(error){await bucket.delete(objectKey).catch(()=>{});throw error;}
  }catch(error){return merchantErrorResponse(error);}
}

export async function GET(request: Request) {
  try {
    const access = await requireMerchantCapability(request, "merchant.read");
    return Response.json({ assets: await listAssets(access.site.id, access.user!.userId, access.user!.email, true) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
