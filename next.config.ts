import type { NextConfig } from "next";

/**
 * Dev-only: Next blocks dev assets and the hot-reload socket for hostnames other
 * than localhost. Telegram Mini Apps are usually tested through a tunnel or from a
 * phone on the LAN, so allow those. Add more with DEV_ALLOWED_ORIGINS="host1,host2".
 */
function devOrigins(): string[] {
  const hosts = ["127.0.0.1", "*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io", "*.trycloudflare.com", "*.loca.lt"];
  try {
    if (process.env.APP_URL) hosts.push(new URL(process.env.APP_URL).hostname);
  } catch {
    // Invalid APP_URL is reported by the setup screen.
  }
  for (const h of (process.env.DEV_ALLOWED_ORIGINS ?? "").split(",")) {
    const host = h.trim().replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
    if (host) hosts.push(host);
  }
  return [...new Set(hosts)];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins(),
};

export default nextConfig;
