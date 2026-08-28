# Vercel Deployment and Supabase Proxy

This project is a Vite React application deployed on Vercel. Supabase requests are routed through Vercel in production to avoid direct browser connections to the Supabase hostname.

## How the Proxy Works

In production, `src/createClients.js` uses the current Vercel site origin. The URL below is only an example:

```text
https://example-nosh-pos.vercel.app/supabase
```

Replace `example-nosh-pos.vercel.app` with the real URL shown after running `vercel --prod`.

The rewrite in `vercel.json` forwards that path to the Supabase project:

```text
/supabase/* -> https://your-project.supabase.co/*
```

The request path is therefore:

```text
Browser -> Vercel -> Supabase
```

The browser does not call the Supabase hostname directly.

## Requirements

- Node.js installed
- npm installed
- A Vercel account
- Access to the Vercel project
- Supabase project URL and public anon key

Do not put a Supabase service-role key in this frontend project. Only use the public anon key in `VITE_SUPABASE_ANON_KEY`.

## Install the Vercel CLI

Run this once:

```bash
npm install --global vercel
```

Check the installation:

```bash
vercel --version
```

## Login to Vercel

```bash
vercel login
```

Follow the browser login instructions. The CLI may ask you to confirm a device code.

## Link the Project

From the project directory:

```bash
cd "C:\path\to\your\project"
vercel link
```

Select your existing Vercel project when prompted.

## Configure Vercel Environment Variables

In the Vercel Dashboard:

1. Open the project.
2. Open **Settings**.
3. Open **Environment Variables**.
4. Add the variables below for **Production**, **Preview**, and **Development** as needed.

```env
# Example values only. Replace them with your own Supabase project values.
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_public_anon_key
```

The URL format for a Supabase project is:

```text
https://your-project.supabase.co
```

Use the public anon key from **Supabase Dashboard -> Project Settings -> API**. Do not commit real keys to this file.

After changing environment variables, create a new deployment. Existing deployments do not automatically rebuild with new variables.

## Deploy to Vercel

Build locally first:

```bash
npm install
npm run build
```

Deploy a preview:

```bash
vercel
```

Deploy production:

```bash
vercel --prod
```

Open the URL printed by Vercel. Do not use `localhost` to test whether the deployed proxy works.

## Verify the Deployment

Open the deployed application and check the browser Network tab. Supabase requests should look like:

```text
https://example-nosh-pos.vercel.app/supabase/rest/v1/inventory
https://example-nosh-pos.vercel.app/supabase/rest/v1/menu
```

These are example URLs. Use your actual deployed Vercel domain when testing.

They should not look like:

```text
https://your-project.supabase.co/rest/v1/inventory
```

A successful REST request normally returns a Supabase response such as `200`, `401`, or `403` depending on authentication and row-level security. A `404` from `/supabase/...` usually means the deployment is using an old `vercel.json`; redeploy after confirming the rewrite is present.

## Important Local Development Limitation

Running this command:

```bash
VITE_USE_SUPABASE_PROXY=true vercel dev
```

starts Vercel/Vite on your own computer. It does not run the proxy in Vercel's cloud network. If the ISP blocks the Supabase connection, the local process can still fail with:

```text
ETIMEDOUT
ERR_CONNECTION_TIMED_OUT
```

The working no-VPN test is a deployed Vercel preview or production URL:

```text
vercel
```

or:

```bash
vercel --prod
```

Then test using the Vercel URL. The network path is:

```text
Your browser -> Vercel cloud -> Supabase
```

## Local Development Without the Proxy

For normal local development, use:

```bash
npm run dev
```

Open the Vite URL, usually:

```text
http://localhost:5173
```

This mode calls Supabase directly and requires that your network can reach Supabase.

## `vercel dev` Local Testing

`vercel dev` is useful for checking Vercel project linking and deployment behavior:

```bash
vercel dev
```

It usually serves the app at:

```text
http://localhost:3000
```

If port 3000 is busy, Vercel may use port 3001 or another port. Use the URL printed in the terminal.

However, `vercel dev` cannot bypass a local ISP restriction. Use a deployed Vercel URL for the actual no-VPN Supabase test.

## Common Errors

### `ERR_CONNECTION_REFUSED`

The local server is not running, or the URL uses the wrong port.

Start it again:

```bash
vercel dev
```

Then use the exact URL printed by the terminal.

### `500 Internal Server Error` from `/supabase/...` locally

Check the Vercel/Vite terminal. If it shows `ETIMEDOUT`, the local machine cannot reach Supabase. This is a network restriction, not a frontend query error.

Use a deployed Vercel URL instead of `localhost`.

### `404` from `/supabase/rest/v1/...` after deployment

Redeploy after confirming `vercel.json` contains this rewrite before the SPA fallback:

```json
{
  "rewrites": [
    {
      "source": "/supabase/:path*",
      "destination": "https://your-project.supabase.co/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Deploy again:

```bash
vercel --prod
```

Then hard-refresh the deployed page.

### Missing environment variables

If the app shows an error about `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`:

1. Add both variables in Vercel Project Settings.
2. Select the correct deployment environments.
3. Redeploy.

## Recommended Deployment Checklist

- [ ] `npm install` completed
- [ ] `npm run build` passes
- [ ] Vercel CLI installed
- [ ] Vercel account logged in
- [ ] Project linked with `vercel link`
- [ ] `VITE_SUPABASE_URL` configured in Vercel
- [ ] `VITE_SUPABASE_ANON_KEY` configured in Vercel
- [ ] `vercel.json` contains the `/supabase/:path*` rewrite
- [ ] Deployed with `vercel --prod`
- [ ] Tested using the deployed Vercel URL
- [ ] Browser Network tab shows requests to the deployed `/supabase` path
