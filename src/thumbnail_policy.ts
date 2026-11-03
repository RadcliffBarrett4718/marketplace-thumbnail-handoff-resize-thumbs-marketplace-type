export type Asset = { productId: string; assetId: string; sourceUrl: string; revision: number };

export function thumbnailPlan(asset: Asset) {
  const prefix = `${asset.productId}/${asset.assetId}/r${asset.revision}`;
  return [
    { role: "search", width: 320, height: 320, key: `${prefix}/search.webp` },
    { role: "detail", width: 960, height: 960, key: `${prefix}/detail.webp` },
  ] as const;
}
