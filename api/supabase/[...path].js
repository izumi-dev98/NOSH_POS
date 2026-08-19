export default async function handler(request, response) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    response.status(500).json({ error: "VITE_SUPABASE_URL is not configured" });
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const supabasePath = requestUrl.pathname.replace(/^\/api\/supabase/, "");
  const targetUrl = `${supabaseUrl}${supabasePath}${requestUrl.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");

  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await new Response(request).arrayBuffer();
  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    redirect: "manual"
  });

  response.status(upstreamResponse.status);
  upstreamResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "content-encoding") response.setHeader(key, value);
  });
  response.send(Buffer.from(await upstreamResponse.arrayBuffer()));
}