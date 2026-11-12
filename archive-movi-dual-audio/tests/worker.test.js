import test from "node:test";
import assert from "node:assert/strict";
import { encodeStreamKey, decodeStreamKey } from "../src/index.js";

test("Base64URL stream keys round-trip Unicode identifiers and filenames", () => {
  const payload = { identifier: "sample-item", file: "folder/Audio track.m4a" };
  assert.deepEqual(decodeStreamKey(encodeStreamKey(payload)), payload);
});
test("stream keys are URL-safe and contain no padding", () => {
  const key = encodeStreamKey({ identifier: "movie", file: "audio.mp3" });
  assert.match(key, /^[A-Za-z0-9_-]+$/);
  assert.equal(key.includes("="), false);
});
test("decoder rejects invalid Base64URL characters", () => {
  assert.throws(() => decodeStreamKey("not+a-valid_key"), /Invalid stream key/);
});
