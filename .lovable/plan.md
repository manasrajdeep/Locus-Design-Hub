# Locus Design — Build Plan

A multi-tenant construction platform with a CMS-driven public site, invite-only customer portal (milestones, timeline, documents, realtime chat), admin panel, and superadmin content management. Built on TanStack Start + Tailwind + shadcn, powered by Lovable Cloud (Supabase) for Auth, Database, Storage, and Realtime.

## 1. Backend (Lovable Cloud)

Enable Lovable Cloud, then create schema via migration:

**Tables**

- `homepage_content` — singleton row: hero_title, hero_subtitle, hero_image_url, stats (jsonb), services (jsonb), portfolio (jsonb of image URLs + captions)
- `profiles` — id (→auth.users), email, full_name, avatar_url
- `user_roles` — (user_id, role) with enum `app_role`: `customer | admin | superadmin`
- `customer_whitelist` — email, invited_by, created_at (admin adds emails here before customer signs up)
- `projects` — id, customer_id, name, address, current_milestone, milestones (jsonb list of {name, status, order}), assigned_admin_id
- `project_updates` — id, project_id, image_url, caption, created_at (daily timeline images)
- `project_documents` — id, project_id, name, file_path, kind (contract|invoice|other), uploaded_at
- `messages` — id, project_id, sender_id, body, created_at (realtime chat)

**Security (RLS)**

- `has_role(uid, role)` security-definer function to avoid recursion.
- Signup trigger: only create profile + auto-assign `customer` role when email is in `customer_whitelist` (otherwise raise exception — invite-only).
- Every project-scoped table: customer can only read rows where `project.customer_id = auth.uid()`; admins can read projects they're assigned to; superadmins see everything.
- `homepage_content`: public SELECT (anon + authenticated); only superadmins UPDATE.
- `customer_whitelist`: only admins/superadmins.
- All GRANTs added per public-schema-grants rule.

**Storage buckets**

- `homepage` (public) — hero + portfolio images
- `project-images` (private) — daily updates, RLS via storage.objects policies scoped to project membership
- `project-documents` (private) — PDFs, same scoping

**Realtime**: enable on `messages` table.

**Seed migration**: insert one `homepage_content` row with placeholder text so the homepage renders immediately.

## 2. Design System

Premium construction aesthetic — architectural, high-contrast, editorial:

- Deep charcoal + warm concrete neutrals with a single accent (burnt amber)
- Serif display headline (Fraunces) + clean sans body (Inter), loaded via `<link>` in `__root.tsx`
- Semantic tokens in `src/styles.css` (`@theme inline`, oklch). Custom `hero`, `stat`, `card-premium` variants — no hardcoded colors in components.
- Subtle scroll reveals via CSS; heavy imagery uses `object-cover` with fixed aspect ratios (aspect-video, aspect-[4/5]) to prevent CLS.

## 3. Routes

```text
/                         Public homepage (CMS-driven, SSR, SEO head)
/auth                     Sign-in / sign-up (invite-only)
/_authenticated/
  portal                  Customer dashboard (milestones, timeline, docs, chat tabs)
  admin                   Admin dashboard (projects list, whitelist, uploads)
  admin/project/$id       Admin project detail (upload images/docs, edit milestones, chat)
  superadmin              Superadmin overview (all projects)
  superadmin/content      Homepage CMS editor
```

Role-based redirect after login. Public homepage uses a public server fn reading `homepage_content` via publishable client.

## 4. Frontend components

- **Homepage**: Hero (full-bleed image + dark overlay + Client Login CTA), TrustStats row, Services cards grid, Portfolio masonry (responsive grid, lazy-loaded).
- **Portal**: Mobile-first tabs — Milestones (stepper progress bar), Timeline (feed of aspect-locked images), Documents (list w/ download), Chat (WhatsApp-style bubbles, sticky composer, Realtime subscription).
- **Admin**: Assigned projects list, whitelist manager, per-project uploader (browser-image-compression before upload, spinner during upload), milestone editor, chat.
- **Superadmin**: Everything above + Content Management form (edit hero, stats, services, portfolio — upload images to `homepage` bucket).
- **Footer**: Global in `__root.tsx` — centered "Website made by manasrajdeep.in".

## 5. Image handling

- `browser-image-compression` on every image upload (max 1600px, ~0.8MB).
- All images rendered inside fixed-aspect containers with `object-cover`.
- Portfolio + hero use `<picture>`/`loading="lazy"` where appropriate.

## 6. SEO

Per-route `head()` with unique title/description/og for `/`, `/auth`. Semantic `<header>/<main>/<section>/<footer>`. Sitemap + robots.

## 7. Delivery order

1. Enable Lovable Cloud + migration (schema, RLS, grants, seed row, storage buckets).
2. Design system + fonts + footer + root SEO.
3. Public homepage wired to CMS.
4. Auth flow (invite-only) + role-based routing.
5. Customer portal (milestones, timeline, documents).
6. Realtime chat.
7. Admin panel (whitelist, uploads, milestones).
8. Superadmin overview + Content Management editor.
9. Sitemap/robots + verification pass.

## Notes / assumptions

- Email/password auth (default). Google OAuth can be added later if desired.
- "Assigned admin" is a single user per project; superadmin can reassign.
- Chat is text-only in v1 (no attachments) to keep scope tight — easy to extend.
- One project per customer in v1; schema supports multiple.

Approve and I'll build it end-to-end.
