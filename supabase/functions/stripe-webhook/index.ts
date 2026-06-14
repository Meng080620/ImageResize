import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// Service-role client bypasses RLS — safe here because this runs server-side only
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('Missing signature', { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    return new Response(`Webhook error: ${(err as Error).message}`, { status: 400 });
  }

  const setPlan = async (userId: string, plan: 'free' | 'premium') => {
    await supabase.from('profiles').update({ plan }).eq('id', userId);
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      if (userId) await setPlan(userId, 'premium');
      break;
    }
    case 'customer.subscription.deleted':
    case 'invoice.payment_failed': {
      // Subscription cancelled or payment failed — downgrade to free
      const obj = event.data.object as { metadata?: { user_id?: string } };
      const userId = obj.metadata?.user_id;
      if (userId) await setPlan(userId, 'free');
      break;
    }
    default:
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
