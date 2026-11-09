#!/usr/bin/env node

import { createPublicClient, getAddress, http, parseAbi } from "viem";

const curveAddress = process.argv[2];
const expectedToken = process.argv[3];
const rpcUrl = process.env.ELYSIUM_RPC?.trim();
const expectedBeacon = process.env.CURVE_BEACON_ADDRESS?.trim();
const expectedFactory = process.env.FACTORY_ADDRESS?.trim();

if (!curveAddress || !expectedToken) {
  throw new Error("Usage: verify-curve-proxy.mjs <curve-address> <token-address>");
}
if (!rpcUrl || !expectedBeacon || !expectedFactory) {
  throw new Error("ELYSIUM_RPC, CURVE_BEACON_ADDRESS, and FACTORY_ADDRESS are required.");
}

const client = createPublicClient({ transport: http(rpcUrl) });
const beaconSlot =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const rawBeacon = await client.getStorageAt({ address: getAddress(curveAddress), slot: beaconSlot });

if (!rawBeacon) throw new Error("Curve has no ERC-1967 beacon slot value.");
const actualBeacon = getAddress(`0x${rawBeacon.slice(-40)}`);
if (actualBeacon !== getAddress(expectedBeacon)) {
  throw new Error(`Curve beacon mismatch: ${actualBeacon} != ${getAddress(expectedBeacon)}`);
}

const beaconImplementation = await client.readContract({
  address: actualBeacon,
  abi: parseAbi(["function implementation() view returns (address)"]),
  functionName: "implementation",
});
const [factory, token] = await Promise.all([
  client.readContract({
    address: getAddress(curveAddress),
    abi: parseAbi(["function factory() view returns (address)"]),
    functionName: "factory",
  }),
  client.readContract({
    address: getAddress(curveAddress),
    abi: parseAbi(["function token() view returns (address)"]),
    functionName: "token",
  }),
]);

if (getAddress(factory) !== getAddress(expectedFactory)) throw new Error("Curve factory wiring mismatch.");
if (getAddress(token) !== getAddress(expectedToken)) throw new Error("Curve token wiring mismatch.");

console.log(
  JSON.stringify(
    {
      curve: getAddress(curveAddress),
      proxyType: "ERC-1967 BeaconProxy",
      beacon: actualBeacon,
      implementation: getAddress(beaconImplementation),
      factory: getAddress(factory),
      token: getAddress(token),
    },
    null,
    2,
  ),
);
