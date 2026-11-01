export function apiProxyRewrites(upstream: string | undefined, publicBase: string | undefined, onVercel: boolean) {
  if (!upstream) {
    if (onVercel) throw new Error("Configure REPOPROOF_API_ORIGIN for the approved backend project");
    return [];
  }
  if (publicBase && publicBase !== "/") throw new Error("Unset NEXT_PUBLIC_API_BASE_URL when using REPOPROOF_API_ORIGIN");
  let url: URL;
  try { url = new URL(upstream); } catch { throw new Error("REPOPROOF_API_ORIGIN must be an exact origin"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (upstream !== upstream.trim() || /[\r\n\0]/.test(upstream) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.hostname.includes("*") || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback && !onVercel))) throw new Error("REPOPROOF_API_ORIGIN must be a secure exact origin");
  return [{ source: "/api/:path*", destination: `${url.origin}/api/:path*` }];
}
