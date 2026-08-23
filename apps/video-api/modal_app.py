"""
Modal deployment wrapper for video-api.

video-api itself is a plain Node/TypeScript/Fastify server (see src/) —
Modal's Python SDK is only used here as a thin launcher: it builds the same
Dockerfile this app already has, starts the compiled Node server as a
subprocess inside Modal's container, and exposes the port Modal proxies
HTTP traffic to via `modal.web_server`. No application logic lives here.

Prerequisites (one-time, on your machine — I can't do this part for you):
    pip install modal
    modal token new          # opens a browser to authenticate this machine

Local dev / staging run (URL only lives as long as the process does):
    modal serve modal_app.py

Deploy (persistent URL):
    modal deploy modal_app.py

Secrets: object-storage credentials (S3_BUCKET, S3_ACCESS_KEY_ID, etc. —
see .env.example) are pulled from a Modal Secret rather than hardcoded
here. Create it once with:
    modal secret create tool5store-video-api-secrets \
        S3_BUCKET=... S3_REGION=auto S3_ENDPOINT=... \
        S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
        ALLOWED_ORIGINS=https://tool5.store,https://app.tool5.store

I have not run this against a live Modal account (no credentials to do
so) — verify with `modal serve` before trusting `modal deploy`.
"""

import subprocess

import modal

app = modal.App("tool5store-video-api")

# Reuses this app's own Dockerfile so there's exactly one source of truth
# for the container's contents (ffmpeg, fonts, the compiled Node build).
image = modal.Image.from_dockerfile("Dockerfile")

PORT = 8080


@app.function(
    image=image,
    cpu=2.0,
    memory=2048,
    timeout=600,  # ffmpeg renders are the whole point of "burst compute" here
    secrets=[modal.Secret.from_name("tool5store-video-api-secrets")],
    min_containers=0,  # scale to zero when idle — this is the whole cost story
)
@modal.concurrent(max_inputs=4)
@modal.web_server(PORT, startup_timeout=30)
def serve():
    # Fire-and-forget: modal.web_server just needs something listening on
    # PORT by the time startup_timeout elapses, then it reverse-proxies to
    # it. The Dockerfile already builds dist/server.js and sets ENV PORT.
    subprocess.Popen(["node", "dist/server.js"], cwd="/app")
