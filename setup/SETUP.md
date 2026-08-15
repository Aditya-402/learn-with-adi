# Learn with Adi — one-time setup

Two accounts, both free, ~20 minutes total. After this, publishing an update is just `git push`.

## 1 · GitHub Pages (hosting)

1. Create a GitHub account if needed → https://github.com
2. Create a new **public** repository, e.g. `learn-with-adi`.
3. From this `site/` folder:
   ```
   git remote add origin https://github.com/<you>/learn-with-adi.git
   git push -u origin main
   ```
4. On GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: main / (root) → Save.**
5. After a minute the site is live at `https://<you>.github.io/learn-with-adi/`.

## 2 · Supabase (sign-in + saved journey)

1. Create a free account → https://supabase.com → **New project** (any name, e.g. `learn-with-adi`; pick the free tier and a region near your students).
2. **Database table:** open **SQL Editor → New query**, paste the contents of `supabase.sql` (next to this file), **Run**.
3. **Google sign-in:**
   - In Supabase: **Authentication → Providers → Google** — you'll see the *Callback URL* it wants (looks like `https://<ref>.supabase.co/auth/v1/callback`). Keep this tab open.
   - Go to https://console.cloud.google.com → create a project → **APIs & Services → OAuth consent screen** (External, fill only app name + your email) → **Credentials → Create credentials → OAuth client ID → Web application**:
     - Authorized JavaScript origins: `https://<you>.github.io`
     - Authorized redirect URI: the Supabase callback URL from above
   - Copy the **Client ID** and **Client secret** into the Supabase Google provider form → Enable → Save.
4. **Allowed redirect URLs:** in Supabase **Authentication → URL Configuration**, set *Site URL* to `https://<you>.github.io/learn-with-adi/` and add the same under *Redirect URLs* (add `https://<you>.github.io/learn-with-adi/**` too).
5. **Wire the site:** in Supabase **Settings → API**, copy the *Project URL* and the *anon public* key into `assets/site-config.js`:
   ```js
   window.LWA_CONFIG = {
     supabaseUrl: "https://<ref>.supabase.co",
     supabaseAnonKey: "<anon key>"
   };
   ```
   Commit and push. Done — the "Sign in" chip appears automatically once these are filled.

Notes:
- The anon key is *designed* to be public; row-level security (set up by `supabase.sql`) is what protects each student's data.
- Until step 2 is done, the site works fine — progress just stays in each visitor's browser.
