import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 数据目录只允许在服务端读取，客户端无法直接访问 data/*.json。
  serverExternalPackages: [],
};

export default nextConfig;
