# Seven Smile Brochure

Brochure and tour price library for Seven Smile, INDO Smile, and No LOGO brochure sets. Built with Vite + React + Tailwind and a small PHP API for Plesk.

## Data Model

One tour has one shared net cost and detail set, with up to 6 brochure files:

- Seven Smile (TH)
- Seven Smile (EN)
- INDO Smile (TH)
- INDO Smile (EN)
- No LOGO (TH)
- No LOGO (EN)

Pricing works like this:

`Sale price = Net cost + park fee + profit`

- `Adult price` / `Child price` are net costs.
- Park fees are separated by Thai/Foreigner and Adult/Child.
- Sales channels such as Facebook Page, Agent, or Walk-in store ADT/CHD profit, not final sale price.
- If the net cost already includes park fees, the app does not add park fees again.

## Files

- `src/` React frontend
- `api/` PHP backend
- `api/uploads/` uploaded brochure files
- `database.sql` latest MySQL schema; run this one SQL file only

## Setup

1. Import `database.sql` into the `sevensmile_brochure` database.
2. Open `api/config.php`.
3. Change `admin_password` before upload.
4. Make sure `api/uploads` is writable on Plesk.

## Local Dev

```bash
npm run dev
```

Local dev proxies `/api` to `https://brochure.sevensmiletourandticket.com` in `vite.config.js`.

## Build

```bash
npm run build
```

Upload:

- Everything inside `dist/` to the document root of `brochure.sevensmiletourandticket.com`
- The `api/` folder to the same document root, so the API is available at `/api`

## URLs

- Library: `https://brochure.sevensmiletourandticket.com`
- Admin: `https://brochure.sevensmiletourandticket.com/#admin`

## Supported Files

- JPG
- PNG
- WEBP
- PDF

Default upload limit is 12 MB. Adjust `max_upload_bytes` in `api/config.php`.
