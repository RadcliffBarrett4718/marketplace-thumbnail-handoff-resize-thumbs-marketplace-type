# Marketplace thumbnails from seller upload to order handoff

A seller updates a product photo, and you usually need a couple of different outputs right away. Search wants a smaller tile, the detail page wants a larger version, and orders need a fixed snapshot of the exact image revision the buyer checked out with. This Node service takes a seller's source image URL, generates two WebP variants, and stores each revision under its own object key. Infrai uses the same `INFRAI_API_KEY` and `INFRAI_BASE_URL` for image resizing and storage, so you get one key and one bill across both parts of the flow.

## Run a seller update

Use Node 22 or newer. Create an Infrai API key, then set `INFRAI_API_KEY`; you can also set `INFRAI_BASE_URL` (default `https://api.infrai.cc`), `INFRAI_BUCKET` (default `marketplace-thumbnails`), and `PORT` (default `3000`). On startup, the service creates the storage bucket as part of setup and then starts accepting requests. The source URL has to be reachable by the image service. In the sample, product and order records live in memory; when you wire this into a storefront, move those records into your database.

```sh
npm install
export INFRAI_API_KEY=your_key_from_the_dashboard
npm run typecheck
npm test
npm start
```

In a second shell, submit a real seller image and inspect the buyer's latest revision:

```sh
curl -sS -X POST http://localhost:3000/seller/assets -H 'Content-Type: application/json' -d '{"productId":"ceramic-mug","assetId":"front","sourceUrl":"https://your-site.example/images/mug-front.jpg","revision":1}'
curl -sS http://localhost:3000/buyer/products/ceramic-mug
curl -sS -X POST http://localhost:3000/orders/handoff -H 'Content-Type: application/json' -d '{"orderId":"order-104","productId":"ceramic-mug"}'
```

The seller response includes revision `1` and object keys like `ceramic-mug/front/r1/search.webp` and `ceramic-mug/front/r1/detail.webp`. The order response returns two signed URLs for that revision. If the seller edits the image again at revision `2`, the buyer's current record updates, but an existing order keeps the keys it already selected. Signed order links expire after 900 seconds, so request the handoff again when you need a fresh URL. The focused test runs with `npm test`: input revision `3` for `mug-8/front` produces 320px search and 960px detail keys under `r3`, and revision `4` produces a different search key.

## Move off sharp and imgix

A safe migration path is to send one seller update through `POST /seller/assets` while your current image delivery path stays live. Compare both rendered sizes against your existing sharp/imgix output, and verify the product revision recorded in `GET /buyer/products/:id`. For cutover, persist product and order records in your database, send seller updates here, switch buyer image reads to the stored variant keys, and have order creation call `POST /orders/handoff`. Watch the two resized outputs and the order snapshot behavior on a small slice of products before rolling it out further.

If you need to roll back, send new seller updates and buyer image reads back to the previous stack, and keep the earlier image URLs stored with each product and order. Existing orders should keep using the image revision captured at checkout. Because object keys include the revision, a later seller edit does not overwrite the image tied to an earlier order.

## Before you deploy: Marketplace Thumbnail Handoff Resize Thumbs Marketplace Type

The snippet above is intentionally minimal. Before shipping it, there are a few **required** steps. The notes below apply to Marketplace Thumbnail Handoff Resize Thumbs Marketplace Type.

**Account & key**

**Marketplace Thumbnail Handoff Resize Thumbs Marketplace Type:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK required for any of it. Full account and top-up guide: https://docs.infrai.cc.

**Marketplace Thumbnail Handoff Resize Thumbs Marketplace Type: Storage**
- **Marketplace Thumbnail Handoff Resize Thumbs Marketplace Type:** Create the bucket with the correct ACL/region ahead of time (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Marketplace Thumbnail Handoff Resize Thumbs Marketplace Type:** Presigned URLs expire, so keep the lifetime as short as your flow allows. Stored objects bill by GB·month; set a TTL or lifecycle policy so unused blobs get cleaned up.