const jwt = process.env.PINATA_JWT?.trim();
const apiUrl = (process.env.PINATA_API_URL || "https://api.pinata.cloud").replace(/\/$/, "");

if (!jwt) {
  console.error("PINATA_JWT is missing.");
  process.exit(1);
}

try {
  const response = await fetch(`${apiUrl}/data/testAuthentication`, {
    headers: { authorization: `Bearer ${jwt}` },
  });
  if (!response.ok) throw new Error(`Pinata authentication failed (${response.status}).`);
  console.log("Pinata JWT authentication passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Pinata authentication failed.");
  process.exit(1);
}
