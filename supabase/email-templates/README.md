# Auth email templates

On-brand, code-first email templates for the OTP signup / reset flow. Each shows the
**`{{ .Token }}`** (6-digit code) prominently — which is what makes the in-app
code-entry step work. Inline styles + table layout so they render in Gmail, Outlook,
and Apple Mail.

## Where to paste them

Supabase Dashboard → **Authentication → Email Templates**. For each template, paste the
matching file into the **Message body (HTML)** and set the **Subject**:

| Template (Supabase tab) | File | Suggested subject |
|---|---|---|
| **Confirm signup** | `confirm-signup.html` | `Your Image Resize verification code` |
| **Magic Link** | `magic-link.html` | `Your Image Resize sign-in code` |
| **Reset Password** | `reset-password.html` | `Reset your Image Resize password` |

> Which template fires when:
> - New-user signup via `signInWithOtp({ shouldCreateUser: true })` → **Confirm signup**
> - Existing-user OTP → **Magic Link**
> - `resetPasswordForEmail` → **Reset Password**
>
> Set all three so every path emails a code.

## Important
- These are **code-only** (no magic-link button) to match the app's `verifyOtp` flow. The
  app never handles a link-redirect, so a link would do nothing — the code is the path.
- `{{ .Token }}` is the load-bearing variable. If you remove it, users get no code.
- Pair this with **custom SMTP (Resend)** in Project Settings → Authentication → SMTP —
  the built-in email service is capped at ~3/hour and will rate-limit you.
- Brand color is `#3b82f6 → #8b5cf6 → #06b6d4` (the landing gradient). Swap the header
  `background-image` if you rebrand.
