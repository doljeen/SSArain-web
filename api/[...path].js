const WAS_BASE_URL = "http://ec2-13-124-222-178.ap-northeast-2.compute.amazonaws.com";

const ignoredRequestHeaders = new Set([
  "host",
  "origin",
  "referer",
  "connection",
  "content-length",
  "accept-encoding"
]);

const ignoredResponseHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "transfer-encoding"
]);

const readBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length ? Buffer.concat(chunks) : undefined;
};

export default async function handler(request, response) {
  const targetUrl = new URL(request.url, WAS_BASE_URL);
  const headers = {};

  Object.entries(request.headers).forEach(([key, value]) => {
    if (!ignoredRequestHeaders.has(key.toLowerCase()) && value !== undefined) {
      headers[key] = value;
    }
  });

  try {
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : await readBody(request);
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual"
    });

    response.statusCode = upstream.status;

    upstream.headers.forEach((value, key) => {
      if (!ignoredResponseHeaders.has(key.toLowerCase()) && key.toLowerCase() !== "set-cookie") {
        response.setHeader(key, value);
      }
    });

    const setCookies = upstream.headers.getSetCookie?.() || [];
    const fallbackCookie = upstream.headers.get("set-cookie");
    if (setCookies.length) {
      response.setHeader("Set-Cookie", setCookies);
    } else if (fallbackCookie) {
      response.setHeader("Set-Cookie", fallbackCookie);
    }

    const payload = Buffer.from(await upstream.arrayBuffer());
    response.end(payload);
  } catch (error) {
    response.statusCode = 502;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({
      status: 502,
      message: "Vercel API proxy failed",
      data: { detail: error.message }
    }));
  }
}
