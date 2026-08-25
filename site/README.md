# site

The tool5store landing page — a single static `index.html`, no build step,
no dependencies. Product cards link out to each app's own subdomain
(`capture.tool5.store`, `render.tool5.store`, `epub.tool5.store`), where
that app serves its own usable UI (see each app's `src/routes/ui.ts`).

## Deploy (GitHub Pages — recommended)

Free, and this is exactly the kind of static file GitHub Pages is for.

1. Repo **Settings → Pages**
2. **Source**: Deploy from a branch → branch `main`, folder `/site`
3. **Settings → Pages → Custom domain**: `tool5.store` (the `CNAME` file
   here already has this, so GitHub Pages picks it up automatically)
4. At your domain registrar, point `tool5.store` at GitHub Pages' IPs
   (four `A` records — see [GitHub's docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
   for the current IPs) or a `CNAME` record if using a `www` subdomain
   instead of the apex domain

## Alternative: Railway

If you'd rather keep everything on one platform, this can also be a
fourth Railway service — same Root Directory pattern as the three apps
(`site`), but it needs a static file server rather than a Dockerfile
build (there's no `package.json` here to build). A `railway.json` with
`"builder": "STATICFILE"` — see
[Railway's static site docs](https://docs.railway.com/guides/static-sites) — deploys `index.html` as-is once Root Directory is set to `site`.
