/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 도커 standalone 출력 (Dockerfile.web 에서 사용)
  output: "standalone",
  // workspace 루트가 monorepo 일 때 lockfile 경로 추정 막기
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
