import { describe, expect, it } from "vite-plus/test";
import { zipSync, strToU8 } from "fflate";
import {
  MAX_FILE,
  MAX_REFRESH_TOKEN_LENGTH,
  parseRefreshTokens,
  prepareImports,
  validName,
} from "./imports";
function file(name: string, bytes: Uint8Array): File {
  return {
    name,
    size: bytes.length,
    arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
  } as File;
}
describe("bounded credential import", () => {
  it("rejects unsafe names", () => {
    expect(validName("../one.info")).toBe(false);
    expect(validName("C:\\one.info")).toBe(false);
    expect(validName("one\0.info")).toBe(false);
    expect(validName("one.info")).toBe(true);
  });
  it("supports root .info ZIP entries and shows per-item unsupported results", async () => {
    const archive = zipSync({
      "one.info": strToU8('{"mock":true}'),
      "../bad.info": strToU8("bad"),
      "readme.txt": strToU8("note"),
    });
    const result = await prepareImports([file("batch.zip", archive)]);
    expect(result.files).toEqual([{ name: "one.info", content: '{"mock":true}' }]);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => !r.ok)).toBe(true);
  });
  it("rejects expansion bombs and oversized single files", async () => {
    const large = new Uint8Array(MAX_FILE + 1);
    const archive = zipSync({ "large.info": large });
    await expect(prepareImports([file("batch.zip", archive)])).rejects.toThrow("解压超限");
    expect((await prepareImports([file("large.info", large)])).results[0].ok).toBe(false);
  });
  it("rejects duplicate names and invalid UTF8", async () => {
    const result = await prepareImports([
      file("one.info", strToU8("{}")),
      file("one.info", strToU8("{}")),
      file("invalid.info", new Uint8Array([255])),
    ]);
    expect(result.files).toHaveLength(1);
    expect(result.results).toHaveLength(2);
  });
});

describe("refresh token batch input", () => {
  it("splits lines, ignores comments and blanks, and dedupes tokens", () => {
    const result = parseRefreshTokens(" rt-a \n# note\n\nrt-b\nrt-a\n");
    expect(result.tokens).toEqual(["rt-a", "rt-b"]);
    expect(result.rejected).toBe(0);
  });
  it("skips oversized lines without dropping the remaining ones", () => {
    const result = parseRefreshTokens(`ok\n${"x".repeat(MAX_REFRESH_TOKEN_LENGTH + 1)}\nnext`);
    expect(result.tokens).toEqual(["ok", "next"]);
    expect(result.rejected).toBe(1);
  });
});
