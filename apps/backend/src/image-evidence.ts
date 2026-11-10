import { createHash } from "node:crypto";
import sharp from "sharp";

export async function computeImageEvidence(image: Buffer): Promise<{
  imageHash: `0x${string}`;
  perceptualHash: `0x${string}`;
}> {
  const imageHash = `0x${createHash("sha256").update(image).digest("hex")}` as const;
  const pixels = await sharp(image).resize(8, 8, { fit: "fill" }).greyscale().raw().toBuffer();
  const average = pixels.reduce((sum, pixel) => sum + pixel, 0) / pixels.length;
  let fingerprint = 0n;
  for (const pixel of pixels) fingerprint = (fingerprint << 1n) | (pixel >= average ? 1n : 0n);
  return {
    imageHash,
    perceptualHash: `0x${fingerprint.toString(16).padStart(16, "0")}` as const,
  };
}
