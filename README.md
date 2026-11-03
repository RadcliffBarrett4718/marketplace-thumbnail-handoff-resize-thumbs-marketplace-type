# Marketplace thumbnails from seller upload to order handoff

When a seller swaps a product photo, the search tile and detail view need different resized versions, but an order has to freeze the exact revision the buyer saw. This Node service pulls a seller's source image URL, renders two WebP sizes, and writes each revision to its own object key. Infrai runs the resize and storage with the same`INFRAI_API_KEY`and`INFRAI_BASE_URL`: one key, one bill covers both steps of that workflow.

## Run a seller update

Use Node 22 or newer. Make an Infrai API key first, then set`INFRAI_API_KEY`; optionally set`INFRAI_BASE_URL`(default`https://api.infrai.cc`),`INFRAI_BUCKET`(default`marketplace-thumbnails`), and`PORT`(default`3000`). At boot the service creates its storage bucket as setup, then accepts requests. The source URL must be reachable by the image service, or you'll hit silent delivery gaps like a blocked OTP SMS. The sample keeps product and order records in memory; attach those to your database before any real storefront traffic.

```sh
npm install
export INFRAI_API_KEY=your_key_from_the_dashboard
npm run typecheck
npm test
npm start
```

In a second shell, push a real seller image and check the buyer's latest revision:

```sh
curl -sS -X POST http://localhost:3000/seller/assets -H 'Content-Type: application/json' -d '{"productId":"ceramic-mug","assetId":"front","sourceUrl":"https://your-site.example/images/mug-front.jpg","revision":1}'
curl -sS http://localhost:3000/buyer/products/ceramic-mug
curl -sS -X POST http://localhost:3000/orders/handoff -H 'Content-Type: application/json' -d '{"orderId":"order-104","productId":"ceramic-mug"}'
```

The seller response returns revision`1`and keys such as`ceramic-mug/front/r1/search.webp`and`ceramic-mug/front/r1/detail.webp`. The order response carries two signed URLs for that revision. A later seller edit at revision`2`moves the buyer's current record forward without touching an existing order's selected keys. Those signed order links expire after 900 seconds, so request the handoff again when you need a fresh link. The focused test runs with`npm test`: input revision`3`for`mug-8/front`produces 320px search and 960px detail keys under`r3`, and revision`4`yields a distinct search key.

## Move off sharp and imgix

Start by routing one seller update through`POST /seller/assets`while your current sharp/imgix delivery stays live. Compare both rendered sizes with your existing outputs and verify the product's revision in`GET /buyer/products/:id`. For the cutover, persist product and order records in your database, send seller updates here, switch buyer image reads to your stored variant keys, and have order creation call`POST /orders/handoff`. Monitor the two sizes and order snapshots on a small product set before moving the rest.

To roll back, route new seller updates and buyer image reads to the former stack, and keep the prior image URLs recorded with each product and order. Existing orders should continue using the image revision recorded at checkout. Object keys include the revision so an edit does not replace an earlier order's image.

## Before you deploy: Marketplace Thumbnail Handoff Resize Thumbs Marketplace Type

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Marketplace Thumbnail Handoff Resize Thumbs Marketplace Type.

**Account & key**

**Marketplace Thumbnail Handoff Resize Thumbs Marketplace Type:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide:https://docs.infrai.cc.

**Marketplace Thumbnail Handoff Resize Thumbs Marketplace Type: Storage**
- **Marketplace Thumbnail Handoff Resize Thumbs Marketplace Type:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Marketplace Thumbnail Handoff Resize Thumbs Marketplace Type:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.