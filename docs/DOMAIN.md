# Custom domain: sightline.study

We own **sightline.study**, registered at Porkbun on 14 Nov 2026. Porkbun handles its DNS (nameservers `curitiba`, `fortaleza`, `maceio` and `salvador.ns.porkbun.com`). The live site is still at https://sightline-theta-drab.vercel.app until the steps below are done.

Connecting it takes two people: whoever owns the Vercel project (step 1), then whoever has the Porkbun login (step 2).

## 1. Vercel: add the domain (project owner)

1. Vercel → the **sightline** project → **Settings → Domains**.
2. Add `sightline.study`. When Vercel asks, also add `www.sightline.study` and let it redirect to `sightline.study`.
3. Vercel then shows the DNS records it wants. Usually they are:

   | Type  | Host  | Value                  |
   | ----- | ----- | ---------------------- |
   | A     | (blank, the root) | `76.76.21.21`          |
   | CNAME | `www` | `cname.vercel-dns.com` |

   **Use whatever Vercel actually shows if it differs** (it sometimes gives a project-specific value). Send those values to the Porkbun account holder.

## 2. Porkbun: add the records (domain owner)

1. Porkbun → Domain Management → `sightline.study` → **DNS**.
2. Delete Porkbun's default parking records (the "2 records set": usually an ALIAS and a wildcard CNAME pointing at `pixie.porkbun.com`). They clash with Vercel's.
3. Add Vercel's records from step 1, with TTL 600:
   - **A**: Host blank, Answer `76.76.21.21`.
   - **CNAME**: Host `www`, Answer `cname.vercel-dns.com`.
4. Leave the nameservers as they are (Porkbun's). Don't switch them to Vercel's.

## 3. Check

- Back in Vercel → Domains, both entries turn green ("Valid Configuration"), usually within a few minutes, though it can take up to an hour. Vercel issues the HTTPS certificate automatically.
- Open https://sightline.study and https://sightline.study/new.
- The iPhone app's Settings → Server can then use `https://sightline.study` (only once it loads in a browser).

## Notes

- No code changes are needed: Next.js works on any domain.
- If a Vercel domain shows "Invalid Configuration" after an hour, the usual cause is a leftover Porkbun parking record. Delete it and wait a few minutes.
