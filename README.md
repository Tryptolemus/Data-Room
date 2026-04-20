<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Data Room

Firebase-backed data room with Google sign-in, per-project email access control, nested folders, and folder/file uploads.

## Features

- **Projects** — top-level containers with per-project email access lists.
- **Folders** — nested folders inside each project.
- **Uploads** — single/multi-file upload *and* folder upload (preserves tree via `webkitdirectory`).
- **Access Control** — admins manage both the global sign-in allowlist and per-project membership.
- **Download lock**, view tracking, and messages.

## Run Locally

Prerequisites: Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Visit http://localhost:3000.

## Deploy to Vercel

This repo is Vercel-ready:

- `vercel.json` sets `vite build` as the build command, `dist` as output, and adds SPA rewrites.
- `api/proxy-pdf.ts` runs as a Vercel Serverless Function.

Steps:

1. Import the GitHub repository in Vercel.
2. Framework Preset is detected as **Vite**.
3. Deploy — no env vars are strictly required (Firebase config is public and bundled from `firebase-applet-config.json`).
4. In Firebase Console → **Authentication → Settings → Authorized domains**, add your Vercel domain (e.g. `your-app.vercel.app`).
5. Deploy `firestore.rules` to Firebase (`firebase deploy --only firestore:rules`).

## First-Time Setup

1. Sign in with the bootstrap admin email (`gt.elysium@gmail.com`) — set in `firestore.rules`. Adjust if you want a different admin.
2. From **Access Control**, authorize additional emails (this controls sign-in).
3. From **Documents**, create a Project. Grant per-project access from **Access Control → Project Access**.
