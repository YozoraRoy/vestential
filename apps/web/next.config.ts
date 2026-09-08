import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@stock/core', '@stock/ai-engine', '@stock/market-data'],
  // tesseract.js 靠 `__dirname` 定位 worker-script（child_process fork），
  // 不能被打包進 .next，否則 worker 路徑失效。保持外部、使用 node_modules 原路徑。
  serverExternalPackages: ['tesseract.js', '@napi-rs/canvas'],
}

export default nextConfig
