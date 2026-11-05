/* ============================================================
   SABHA — SETTINGS. The only file you edit to go live.
   SUPABASE_URL empty = DEMO MODE (sample data, kept only in this browser).
   ============================================================ */
window.SABHA_CONFIG = Object.freeze({
  BRAND: 'Sabha',
  TAGLINE: 'The private hub for India’s founders, business owners and investors.',

  // Supabase > Project Settings > API. The anon key is safe to publish: the database rules protect the data.
  // NEVER paste the service_role key here.
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  CONTACT_EMAIL: 'hello@yourdomain.in',
  GRIEVANCE_OFFICER: 'Your name',   // required by India's DPDP Act: who handles data complaints

  // Optional photos. Put your own images in an "img" folder and name them here, e.g. hero: 'img/hero.jpg'.
  // Empty = the built-in skyline illustrations. Use photos you own or have a licence for.
  IMAGES: { hero: '', cta: '' },

  // Razorpay Payment Page links. Empty = "we'll send you a link by email".
  PAYMENT_LINKS: { founding: '', founder_month: '', founder_year: '', business_month: '', business_year: '' },

  PRICES: {
    founding: { label: 'Founding', amt: '₹999', per: 'per month, for life', note: 'The first 100 approved members' },
    founder:  { label: 'Founder', amt: '₹1,999', per: 'per month', note: '₹19,999 a year' },
    business: { label: 'Owner', amt: '₹1,499', per: 'per month', note: '₹14,999 a year' },
    investor: { label: 'Investor', amt: 'By invitation', per: 'complimentary', note: 'Verified investors only' }
  }
});
