/** @type {import('next').NextConfig} */
const isTauri = process.env.TAURI === '1';

const nextConfig = {
  typedRoutes: false,
  // For Tauri builds we ship a static export so the .app bundle has no Node
  // server. The Tauri shell hosts the bundled HTML/JS only; the AI proxy is
  // expected to run as a remote service (see README).
  ...(isTauri ? { output: 'export', images: { unoptimized: true } } : {}),
};

export default nextConfig;
