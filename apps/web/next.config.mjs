/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @wibot/core es un paquete del workspace en TypeScript compilado a ESM.
  serverExternalPackages: ['mysql2'],
};

export default nextConfig;
