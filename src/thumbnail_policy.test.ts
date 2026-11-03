import assert from "node:assert/strict";
import test from "node:test";
import { thumbnailPlan } from "./thumbnail_policy.js";

test("a seller revision changes both buyer-facing object keys", () => {
  const asset = { productId: "mug-8", assetId: "front", sourceUrl: "https://example.com/front.jpg", revision: 3 };
  assert.deepEqual(thumbnailPlan(asset).map(({ role, width, key }) => ({ role, width, key })), [
    { role: "search", width: 320, key: "mug-8/front/r3/search.webp" },
    { role: "detail", width: 960, key: "mug-8/front/r3/detail.webp" },
  ]);
  assert.notEqual(thumbnailPlan(asset)[0].key, thumbnailPlan({ ...asset, revision: 4 })[0].key);
});
