# GPT Mathematical Web

Next.js launch site, account portal, Stripe checkout, free export quota, and license API for GPT Mathematical.

## Local setup

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Fill `.env.local` with Supabase and Stripe test-mode values. Use a restricted Stripe API key in hosted environments when possible.

## Supabase

Run `supabase/schema.sql` in the Supabase SQL editor. The app uses:

- Supabase Auth magic links for the account portal.
- The service role key only in server routes.
- Row-level security for customer-facing reads.
- Free account licenses and monthly export usage metering.

## Stripe

Create three Stripe Prices and set their IDs:

- `STRIPE_MONTHLY_PRICE_ID` for Plus Monthly at $2/month
- `STRIPE_YEARLY_PRICE_ID` for Plus Yearly at $20/year
- `STRIPE_LIFETIME_PRICE_ID` for Lifetime at $30 once

Set the webhook endpoint to:

```text
https://your-domain.example/api/stripe/webhook
```

Subscribe to these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Stripe Tax is intentionally not enabled in code until active registrations are confirmed in Stripe.

## Vercel

Set the `web/` directory as the Vercel project root and configure all variables from `.env.example`.
