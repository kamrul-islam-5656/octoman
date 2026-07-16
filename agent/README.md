# Octoman Local Agent

Lets the deployed Octoman app run requests against `localhost` / private-network
backends on your machine, without needing CORS configured on those backends.

## Why this exists

The deployed app executes most requests from its own server, which can't reach
your machine's `localhost`. Octoman detects local/private targets and falls
back to running them from your browser instead — but browsers still enforce
CORS, so the target backend must allow the deployed origin. This agent removes
that requirement entirely: it's a plain local process (not a browser page), so
it can call any local backend directly, the same way Postman's Desktop Agent
does for web.postman.co.

## Run it

```
npm run agent
```

(or `node agent/octoman-agent.mjs` directly). Leave it running while you test
requests against `localhost`/private IPs in Octoman — it listens on
`http://127.0.0.1:47893` and is picked up automatically; no other setup is
required. If it's not running, Octoman falls back to executing the request
directly from your browser (which still needs the target to send CORS
headers).

## Config (optional env vars)

- `OCTOMAN_AGENT_PORT` — default `47893`.
- `OCTOMAN_AGENT_ALLOWED_ORIGINS` — comma-separated list of web app origins
  allowed to use this agent. Default:
  `https://octoman-lite.vercel.app,http://localhost:3000`.
