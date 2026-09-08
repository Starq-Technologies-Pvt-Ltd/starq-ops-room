# STARQ Operations Room

Private deployment surface for the STARQ Operations Room.

This repository intentionally contains no live Room data, identities, inboxes, cursors, logs, or credentials. The Vercel deployment is a secure proxy surface and requires an authenticated upstream configured through environment variables.

## Vercel configuration

Set these environment variables in the private Vercel project:

- `OPS_ROOM_UPSTREAM_URL`: HTTPS URL of the authenticated Room API.
- `OPS_ROOM_UPSTREAM_TOKEN`: upstream bearer token.

The proxy returns `503` until both values are configured. Never commit either value.

## Local development

```text
npm install
npm run dev
```

This scaffold is deliberately not connected to the local `agent-comms` files. Connect a separately authenticated upstream before sharing the Vercel URL.
