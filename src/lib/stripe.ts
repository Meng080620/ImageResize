/// <reference types="vite/client" />
import { supabase } from './supabase';

// TODO(stripe-webhook): Payment flow is incomplete.
// startCheckout() creates a Stripe Checkout session (via the Edge Function
// supabase/functions/create-checkout-session), but the webhook that upgrades
// the user's plan after a successful payment does NOT exist yet.
//
// What's needed to complete the flow:
//   1. Supabase Edge Function: supabase/functions/stripe-webhook/index.ts
//      - Verify the Stripe-Signature header with stripe.webhooks.constructEvent()
//      - Handle checkout.session.completed event
//      - Update profiles.plan = 'premium' WHERE id = metadata.userId
//   2. Register the webhook URL in the Stripe Dashboard:
//      https://<project>.supabase.co/functions/v1/stripe-webhook
//   3. Add STRIPE_WEBHOOK_SECRET to Supabase secrets (supabase secrets set ...)
//
// Until the webhook exists, only ADMIN_EMAILS users (see supabase.ts) can access
// premium features — no paid user will actually be upgraded.

export async function startCheckout(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 'Not signed in';

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        successUrl: `${window.location.origin}/#/app?payment=success`,
        cancelUrl: `${window.location.origin}/#/`,
      }),
    },
  );

  const json = await res.json();
  if (!res.ok || json.error) return json.error ?? 'Checkout failed';

  window.location.href = json.url;
  return null;
}
