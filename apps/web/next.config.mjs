/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Dynamic token routes must resolve newly indexed launches without rebuilding the site.
  // workspace package shipped as TypeScript source
  transpilePackages: ["@squeez/shared"],
  webpack: (config) => {
    // wagmi connectors pull optional deps we don't use
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};
export default nextConfig;

const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");
initOpenNextCloudflareForDev();
