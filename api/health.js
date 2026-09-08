export default function handler(_req, res) {
  res.status(200).json({
    service: 'starq-ops-room',
    upstreamConfigured: Boolean(process.env.OPS_ROOM_UPSTREAM_URL && process.env.OPS_ROOM_UPSTREAM_TOKEN),
  });
}
