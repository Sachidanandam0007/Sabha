# Sabha

The private hub for India's founders, business owners and investors: application-only, verified members, introductions by consent.

**Live (after setup):** https://sachidanandam0007.github.io/sabha/

## What's in this repo

| File | Purpose |
|---|---|
| `index.html` | Page, design and security policy |
| `app.js` | App logic (hub, deal room, events, intros, admin desk) |
| `config.js` | **Settings you edit:** Supabase keys, prices, payment links, contact |
| `supabase/schema.sql` | Database tables and security rules. Run it once in Supabase |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

The site is plain HTML, CSS and JavaScript, with no build step. With `SUPABASE_URL` empty, it runs in **demo mode** with sample members.

## Publish on GitHub Pages

### Option A: in the browser (no software needed)

1. On github.com, go to **New repository**. Name it `sabha`, make it **Public**, and choose **Create repository**.
2. Choose **uploading an existing file**. Drag in `index.html`, `app.js`, `config.js`, `robots.txt`, `README.md` and the `supabase` folder, then choose **Commit changes**.
3. Add `.nojekyll`: choose **Add file > Create new file**, name it `.nojekyll`, leave it empty, and commit.
4. Go to **Settings > Pages > Build and deployment**. Set Source to **Deploy from a branch**, Branch to **main** and folder to **/ (root)**, then **Save**.
5. Wait 1–2 minutes. The site is live at `https://sachidanandam0007.github.io/sabha/`.

### Option B: with git

```bash
cd sabha-site
git init -b main
git add .
git commit -m "Launch Sabha"
git remote add origin https://github.com/sachidanandam0007/sabha.git
git push -u origin main
```
Then do step 4 above.

### Updating the site later

Edit a file on GitHub (pencil icon) and commit. The site updates in about a minute.

## Go live with real members

1. Create a project at **supabase.com** (Mumbai region). In **SQL Editor**, run `supabase/schema.sql`, then run the "MAKE YOURSELF ADMIN" block at the end with your email.
2. Go to **Authentication > URL Configuration**. Set the Site URL and the Redirect URL to `https://sachidanandam0007.github.io/sabha/`.
3. Go to **Authentication**:
   - Turn on CAPTCHA (Cloudflare Turnstile).
   - Turn off password sign-up.
   - Add custom SMTP (Resend or Zoho). The built-in email only sends a few messages an hour.
4. Go to **Project Settings > API**. Copy the Project URL and the **anon public** key into `config.js` on GitHub, and commit. **Never** use the service_role key.
5. Add your Razorpay payment links, contact email and grievance officer to `config.js`.

## Security

- Every permission is enforced in the database (row-level security), not only in the browser.
- Contact details, billing and admin records are kept in separate locked tables.
- There are rate limits on applications, posts, intros, rounds and events.
- Links are limited to http(s), all member text is escaped, and there are no inline scripts.
- A strict Content-Security-Policy is set, and the Supabase library is checked with Subresource Integrity.

GitHub Pages can't send custom security headers, so it can't block other sites from embedding yours in a frame. For that last layer, host on Cloudflare Pages instead. It reads a `_headers` file, which I can supply.
