import { backendConfig } from "./config.js";

interface PinataUploadResponse {
  data?: { cid?: string };
  cid?: string;
}

async function upload(file: Blob, name: string): Promise<string> {
  const jwt = backendConfig.pinata.jwt;
  if (!jwt) throw new Error("Pinata is not configured");
  const form = new FormData();
  form.set("network", "public");
  form.set("name", name);
  form.set("file", file, name);
  const response = await fetch(backendConfig.pinata.uploadUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Pinata upload failed (${response.status})`);
  const result = await response.json() as PinataUploadResponse;
  const cid = result.data?.cid ?? result.cid;
  if (!cid || !/^[a-zA-Z0-9]+$/.test(cid)) throw new Error("Pinata returned an invalid CID");
  return cid;
}

export async function pinLaunchMetadata(input: {
  image: Buffer;
  imageMime: string;
  imageExtension: string;
  name: string;
  symbol: string;
  description: string;
  website?: string;
  x?: string;
  telegram?: string;
}): Promise<{ imageUri: string; metadataUri: string }> {
  const safeSymbol = input.symbol.toLowerCase();
  const imageCid = await upload(
    new Blob([Uint8Array.from(input.image)], { type: input.imageMime }),
    `${safeSymbol}-image.${input.imageExtension}`,
  );
  const imageUri = `ipfs://${imageCid}`;
  const metadata = {
    schema: "squeez.token.v1",
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: imageUri,
    links: {
      ...(input.website ? { website: input.website } : {}),
      ...(input.x ? { x: input.x } : {}),
      ...(input.telegram ? { telegram: input.telegram } : {}),
    },
  };
  const metadataCid = await upload(
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    `${safeSymbol}-metadata.json`,
  );
  return { imageUri, metadataUri: `ipfs://${metadataCid}` };
}
