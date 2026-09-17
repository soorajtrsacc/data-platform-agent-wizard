/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["jszip", "xlsx", "pako"],
  },
};
export default nextConfig;
