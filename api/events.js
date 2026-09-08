export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const upstream = process.env.OPS_ROOM_UPSTREAM_URL;
  const token = process.env.OPS_ROOM_UPSTREAM_TOKEN;
  if (!upstream || !token) {
    return res.status(503).json({ error: 'upstream_not_configured' });
  }

  const since = String(req.query?.since ?? '0');
  const url = new URL('/api/events', upstream);
  url.searchParams.set('since', since);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await response.text();
  res.status(response.status).setHeader('Content-Type', 'application/json').send(body);
}
