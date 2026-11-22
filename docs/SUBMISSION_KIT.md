# StrataOS — Community & Awesome-List Submission Kit

Use the copy-paste blocks below to submit **StrataOS** to community lists and configure GitHub repository discoverability.

---

## 1. Awesome-List One-Liner (14-Word Description)

> **14-Word Description:**
> `Browser-native Linux 7.x Web OS with persistent ext4 storage and a WASM package manager.`

### For [`mbasso/awesome-wasm`](https://github.com/mbasso/awesome-wasm)

```markdown
- [StrataOS](https://github.com/Maor-404/StrataOS) - Browser-native Linux 7.x Web OS with persistent ext4 storage and a WASM package manager.
```

### For [`vitejs/awesome-vite`](https://github.com/vitejs/awesome-vite)

```markdown
- [StrataOS](https://github.com/Maor-404/StrataOS) - Browser-native Linux 7.x Web OS with persistent ext4 storage and a WASM package manager.
```

---

## 2. Recommended GitHub Topics

Add the following **8 exact topics** in the repository's **About → Settings (gear icon) → Topics** field:

```text
webassembly, linux, web-os, wasi, wasm, react, typescript, browser-os
```

- `webassembly`
- `linux`
- `web-os`
- `wasi`
- `wasm`
- `react`
- `typescript`
- `browser-os`

---

## 3. GitHub Discoverability & Social Preview Checklist

- [ ] **Upload Social Preview Image:**
  1. Go to **Repository Settings → General → Social preview**.
  2. Click **Edit → Upload an image...** and select [`public/og-preview.png`](../public/og-preview.png) (1280×640, generated from [`public/og-preview.svg`](../public/og-preview.svg)).
- [ ] **Enable GitHub Discussions (*Ideas* Category):**
  1. Go to **Repository Settings → General → Features**.
  2. Check **Discussions** to enable the Discussions tab.
  3. Open the **Discussions** tab, confirm the **Ideas** category is active, and pin a welcome post inviting contributors to submit community `.wasm` / WASI packages for the `strataget` registry (`public/registry/index.json`).
- [ ] **Connect Vercel Production Deployment:**
  1. Import the repository on [Vercel](https://vercel.com/new) (Hobby tier).
  2. Vercel automatically detects [`vercel.json`](../vercel.json) (`COOP: same-origin`, `COEP: require-corp`, `CORP: same-origin`, and SPA rewrites).
  3. Paste the resulting production URL into the repository's **About → Website** field.
