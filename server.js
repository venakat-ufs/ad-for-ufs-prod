require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const zipcodes = require('zipcodes');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const STRIPE_PAYMENT_METHODS = (process.env.STRIPE_PAYMENT_METHODS || 'card')
  .split(',')
  .map((method) => method.trim())
  .filter(Boolean);
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
  // Basic guardrail to avoid silent failures
  console.warn('Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE is not set. /api/leads will fail.');
}
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Warning: STRIPE_SECRET_KEY is not set. Payments will fail.');
}
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  console.warn('Warning: STRIPE_WEBHOOK_SECRET is not set. Webhook verification will fail.');
}
if (!process.env.GOOGLE_MAPS_API_KEY) {
  console.warn('Warning: GOOGLE_MAPS_API_KEY is not set. Location lookup will use OpenAI if configured.');
}
if (!SUPABASE_ANON_KEY) {
  console.warn('Warning: SUPABASE_ANON_KEY is not set. Admin authentication will not work.');
}

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE || ''
);

const SERVICE_OPTIONS = [
  // Plumbing
  'Plumbing Diagnostic',
  'Toilet Clog Removal',
  'Drain Clog Clearing',
  'Leak Stop / Emergency Water Shutoff',
  'Water Heater Diagnostic',
  // Electrical
  'Electrical Diagnostic',
  'Outlet / Switch Repair',
  'Ceiling Light / Fixture Troubleshooting',
  'Smoke / CO Detector Replacement',
  // HVAC
  'HVAC Diagnostic',
  'Thermostat Replacement',
  'HVAC Airflow / Filter Service',
  // Appliances
  'Appliance Diagnostic',
  'Garbage Disposal Repair',
  'Dishwasher Leak Check',
  // Doors & Security
  'Lock Rekey / Repair',
  'Door Alignment Repair',
  'Window / Sliding Door Repair',
  // Water & Damage
  'Leak Detection',
  'Mold / Moisture Assessment',
  // General Services
  'Drywall Patch + Paint',
  'Caulking / Sealing',
  'Fence / Gate Repair',
  'Pest Control',
  'Safety Hazard Check',
  'Handyman - 1 Hour'
];

// Service prices in cents
const SERVICE_PRICES = {
  'Plumbing Diagnostic': 17500,
  'Toilet Clog Removal': 15000,
  'Drain Clog Clearing': 17500,
  'Leak Stop / Emergency Water Shutoff': 22500,
  'Water Heater Diagnostic': 19500,
  'Electrical Diagnostic': 18500,
  'Outlet / Switch Repair': 16000,
  'Ceiling Light / Fixture Troubleshooting': 17500,
  'Smoke / CO Detector Replacement': 12500,
  'HVAC Diagnostic': 22500,
  'Thermostat Replacement': 19500,
  'HVAC Airflow / Filter Service': 14500,
  'Appliance Diagnostic': 19500,
  'Garbage Disposal Repair': 16500,
  'Dishwasher Leak Check': 18500,
  'Lock Rekey / Repair': 16000,
  'Door Alignment Repair': 17500,
  'Window / Sliding Door Repair': 18500,
  'Leak Detection': 27500,
  'Mold / Moisture Assessment': 32500,
  'Drywall Patch + Paint': 27500,
  'Caulking / Sealing': 16500,
  'Fence / Gate Repair': 25000,
  'Pest Control': 19500,
  'Safety Hazard Check': 22500,
  'Handyman - 1 Hour': 16000
};
const SERVICE_MAP = new Map(
  SERVICE_OPTIONS.map((option) => [normalizeServiceName(option), option])
);

const SUGGESTION_SYSTEM_PROMPT = [
  'You are a property maintenance service matcher. Match user descriptions to the correct service.',
  'AVAILABLE SERVICES:',
  'Plumbing: Plumbing Diagnostic ($175), Toilet Clog Removal ($150), Drain Clog Clearing ($175), Leak Stop / Emergency Water Shutoff ($225), Water Heater Diagnostic ($195)',
  'Electrical: Electrical Diagnostic ($185), Outlet / Switch Repair ($160), Ceiling Light / Fixture Troubleshooting ($175), Smoke / CO Detector Replacement ($125)',
  'HVAC: HVAC Diagnostic ($225), Thermostat Replacement ($195), HVAC Airflow / Filter Service ($145)',
  'Appliances: Appliance Diagnostic ($195), Garbage Disposal Repair ($165), Dishwasher Leak Check ($185)',
  'Doors & Security: Lock Rekey / Repair ($160), Door Alignment Repair ($175), Window / Sliding Door Repair ($185)',
  'Water & Damage: Leak Detection ($275), Mold / Moisture Assessment ($325)',
  'General: Drywall Patch + Paint ($275), Caulking / Sealing ($165), Fence / Gate Repair ($250), Pest Control ($195), Safety Hazard Check ($225), Handyman - 1 Hour ($160)',
  'RULES:',
  '- If water is actively leaking/spraying → Leak Stop / Emergency Water Shutoff',
  '- If water stain/wet wall/moisture → Leak Detection',
  '- If unclear issue → recommend the Diagnostic service for that category',
  '- Return 1-3 most relevant services only',
  'Respond with JSON: {"suggestions":["Service A","Service B"]}'
].join(' ');

const PRICE_FALLBACK_CENTS = 19500;

function getServicePriceCents(serviceName) {
  const value = String(serviceName || '').trim();
  if (!value) return null;

  // Direct lookup from SERVICE_PRICES
  if (SERVICE_PRICES[value]) {
    return SERVICE_PRICES[value];
  }

  return PRICE_FALLBACK_CENTS;
}

function getAddressComponent(components, type, useShortName = false) {
  const match = components.find((component) => component.types?.includes(type));
  if (!match) return '';
  return useShortName ? match.short_name : match.long_name;
}

function parseGeocodeResult(result) {
  const components = Array.isArray(result?.address_components) ? result.address_components : [];
  const city =
    getAddressComponent(components, 'locality') ||
    getAddressComponent(components, 'postal_town') ||
    getAddressComponent(components, 'administrative_area_level_3') ||
    getAddressComponent(components, 'sublocality') ||
    getAddressComponent(components, 'neighborhood');
  const state = getAddressComponent(components, 'administrative_area_level_1', true);
  const country = getAddressComponent(components, 'country');
  const postalCode = getAddressComponent(components, 'postal_code');
  return { city, state, country, postalCode };
}

function parseOpenAiZipResponse(content) {
  if (!content) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (innerError) {
        parsed = null;
      }
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const city = String(parsed.city || '').trim();
  const state = String(parsed.state || '').trim();
  const country = String(parsed.country || '').trim();
  const postalCode = String(parsed.postalCode || parsed.postal_code || '').trim();
  if (!city && !state && !country && !postalCode) return null;
  return { city, state, country, postalCode };
}

async function lookupZipWithOpenAi({ zip, city, state, country }) {
  if (!process.env.OPENAI_API_KEY) return null;
  const userPrompt = [
    `Postal code: ${zip || ''}`,
    `City (if known): ${city || ''}`,
    `State/region (if known): ${state || ''}`,
    `Country (if known): ${country || ''}`
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'Return JSON only in this format: {"city":"","state":"","country":"","postalCode":""}.' +
            ' If you are not confident, return empty strings. Use state abbreviations when applicable.'
        },
        {
          role: 'user',
          content: userPrompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI zip lookup failed', errorText);
    return null;
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content?.trim() || '';
  return parseOpenAiZipResponse(rawContent);
}

function formatUsd(cents) {
  if (!Number.isFinite(cents)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100);
}

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).send('Stripe webhook not configured');
  }

  const signature = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature error', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const leadId = session?.metadata?.lead_id;

    if (leadId) {
      const updatePayload = {
        payment_status: 'paid',
        payment_session_id: session.id || null,
        payment_intent_id: session.payment_intent || null,
        price_cents: session.amount_total || null,
        currency: session.currency || 'usd',
        paid_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('leads')
        .update(updatePayload)
        .eq('id', leadId);

      if (error) {
        console.error('Failed to update payment status', error);
      }
    }
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

function parseCookies(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, part) => {
    const [key, value] = part.trim().split('=');
    acc[key] = decodeURIComponent(value || '');
    return acc;
  }, {});
}

async function verifySupabaseSession(req) {
  const cookies = parseCookies(req);
  const accessToken = cookies['sb-access-token'];

  if (!accessToken) return null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return null;
    return user;
  } catch (err) {
    console.error('Session verification error:', err);
    return null;
  }
}

function clearAuthCookies(res) {
  res.setHeader('Set-Cookie', [
    'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax',
    'sb-refresh-token=; Path=/; Max-Age=0; SameSite=Lax'
  ]);
}

async function requireAuth(req, res, next) {
  const user = await verifySupabaseSession(req);
  if (user) {
    req.adminUser = user.email;
    return next();
  }
  return res.redirect('/admin/login');
}

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'ad.html'));
});

app.get('/form', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/supabase-config', (_req, res) => {
  res.json({
    url: process.env.SUPABASE_URL || '',
    anonKey: SUPABASE_ANON_KEY
  });
});

app.post('/api/reverse-geocode', async (req, res) => {
  const { lat, lng } = req.body || {};

  if (!lat || !lng) {
    return res.status(400).json({ success: false, message: 'Missing coordinates' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, message: 'Geocoding not configured' });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.results || !data.results[0]) {
      return res.json({ success: false, message: 'Location not found' });
    }

    const components = data.results[0].address_components;
    let city = '';
    let state = '';
    let zip = '';

    for (const comp of components) {
      if (comp.types.includes('locality')) city = comp.long_name;
      if (!city && comp.types.includes('sublocality_level_1')) city = comp.long_name;
      if (!city && comp.types.includes('administrative_area_level_2')) city = comp.long_name;
      if (comp.types.includes('administrative_area_level_1')) state = comp.short_name;
      if (comp.types.includes('postal_code')) zip = comp.long_name;
    }

    return res.json({
      success: true,
      city,
      state,
      zip
    });
  } catch (err) {
    console.error('Reverse geocode error:', err);
    return res.status(500).json({ success: false, message: 'Geocoding failed' });
  }
});

app.get('/admin/login', async (req, res) => {
  const user = await verifySupabaseSession(req);
  if (user) {
    return res.redirect('/admin');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin/logout', (_req, res) => {
  clearAuthCookies(res);
  res.redirect('/admin/login');
});

app.post('/api/leads', async (req, res) => {
  const {
    role,
    name,
    email,
    phone,
    companyName,
    propertyAddress,
    description,
    serviceNeeded,
    appointmentDate,
    occupancyStatus,
    entryMethod,
    tenantName,
    tenantPhone,
    tenantEmail
  } = req.body || {};

  if (!role || !name || !email || !phone) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields'
    });
  }

  if (role !== 'client') {
    return res.status(400).json({
      success: false,
      message: 'Unsupported role'
    });
  }

  const priceCents = serviceNeeded ? getServicePriceCents(serviceNeeded) : null;

  const lead = {
    role,
    name,
    email,
    phone,
    companyname: companyName || null,
    propertyaddress: propertyAddress || null,
    description: description || null,
    serviceneeded: serviceNeeded || null,
    appointmentdate: appointmentDate || null,
    occupancy_status: occupancyStatus || null,
    entry_method: entryMethod || null,
    tenant_name: tenantName || null,
    tenant_phone: tenantPhone || null,
    tenant_email: tenantEmail || null,
    price_cents: priceCents,
    currency: priceCents ? 'usd' : null,
    payment_status: priceCents ? 'unpaid' : null
  };

  try {
    const { data, error } = await supabase.from('leads').insert([lead]).select('id, created_at').single();
    if (error) {
      console.error('Failed to insert lead', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }

    console.log('New lead:', { id: data?.id, ...lead });
    return res.json({
      success: true,
      message: 'Lead captured',
      id: data?.id
    });
  } catch (err) {
    console.error('Supabase insert error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/service-price', (req, res) => {
  const serviceName = String(req.query?.service || '').trim();
  if (!serviceName) {
    return res.status(400).json({ success: false, message: 'Service is required' });
  }

  const priceCents = getServicePriceCents(serviceName);
  if (!priceCents) {
    return res.status(404).json({ success: false, message: 'Price not available' });
  }

  return res.json({
    success: true,
    service: serviceName,
    price_cents: priceCents,
    price: formatUsd(priceCents)
  });
});

app.get('/api/maps-config', (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
  res.json({ apiKey });
});

app.post('/api/lookup-zipcode', async (req, res) => {
  const { street, city, state } = req.body || {};

  if (!street || !city || !state) {
    return res.status(400).json({ success: false, message: 'Street, city, and state are required' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ success: false, message: 'AI not configured' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'You are a US ZIP code lookup assistant. Given a street address, city, and state, return ONLY the 5-digit ZIP code. Return just the ZIP code number, nothing else. If you cannot determine the ZIP code, return "unknown".'
          },
          {
            role: 'user',
            content: `What is the ZIP code for: ${street}, ${city}, ${state}`
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error('OpenAI request failed');
    }

    const data = await response.json();
    const zipCode = data.choices?.[0]?.message?.content?.trim() || '';

    // Validate it looks like a ZIP code (5 digits)
    if (/^\d{5}$/.test(zipCode)) {
      return res.json({ success: true, zipCode });
    }

    return res.json({ success: false, message: 'Could not determine ZIP code' });
  } catch (error) {
    console.error('ZIP lookup error:', error);
    return res.status(500).json({ success: false, message: 'Lookup failed' });
  }
});

app.post('/api/geocode', async (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);

  const zip = String(req.body?.zip || '').trim();
  const street = String(req.body?.street || '').trim();
  const city = String(req.body?.city || '').trim();
  const state = String(req.body?.state || '').trim();
  const country = String(req.body?.country || '').trim();

  if (!zip && !street) {
    return res.status(400).json({ success: false, message: 'ZIP code or street is required' });
  }

  const normalizedZip = zip.replace(/\s+/g, '').split('-')[0];
  if (normalizedZip) {
    const lookup = zipcodes.lookup(normalizedZip);
    if (lookup && lookup.city && lookup.state) {
      return res.json({
        success: true,
        city: lookup.city,
        state: lookup.state,
        postalCode: lookup.zip || normalizedZip
      });
    }
  }

  if (!apiKey && !hasOpenAi) {
    return res.status(500).json({ success: false, message: 'No location provider configured' });
  }

  if (apiKey) {
    const addressParts = [street, zip, city, state, country].filter(Boolean).join(' ');
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', addressParts);
    url.searchParams.set('key', apiKey);

    try {
      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'OK' && Array.isArray(data.results) && data.results.length) {
          const result = data.results[0];
          const parsed = parseGeocodeResult(result);
          return res.json({
            success: true,
            ...parsed,
            formatted: result.formatted_address || '',
            location: result.geometry?.location || null
          });
        }
      } else {
        const errorText = await response.text();
        console.error('Geocode request failed', errorText);
      }
    } catch (err) {
      console.error('Geocode error', err);
    }
  }

  if (hasOpenAi) {
    try {
      const aiResult = await lookupZipWithOpenAi({ zip, city, state, country });
      if (aiResult) {
        return res.json({ success: true, ...aiResult });
      }
    } catch (err) {
      console.error('OpenAI zip lookup error', err);
    }
  }

  return res.json({ success: false, message: 'No match found' });
});

app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ success: false, message: 'Stripe not configured' });
  }

  const { leadId, serviceName, email } = req.body || {};
  if (!leadId || !serviceName) {
    return res.status(400).json({ success: false, message: 'Lead and service are required' });
  }

  const priceCents = getServicePriceCents(serviceName);
  if (!priceCents) {
    return res.status(400).json({ success: false, message: 'Price not available' });
  }

  try {
    const paymentMethodOptions = STRIPE_PAYMENT_METHODS.includes('us_bank_account')
      ? { us_bank_account: { verification_method: 'automatic' } }
      : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: STRIPE_PAYMENT_METHODS,
      payment_method_options: paymentMethodOptions,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: priceCents,
            product_data: {
              name: `United Field Services - ${serviceName}`
            }
          }
        }
      ],
      customer_email: email || undefined,
      success_url: `${APP_BASE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_BASE_URL}/payment-cancel`,
      metadata: {
        lead_id: String(leadId),
        service_name: serviceName
      }
    });

    const { error } = await supabase
      .from('leads')
      .update({
        payment_status: 'pending',
        price_cents: priceCents,
        currency: 'usd',
        payment_session_id: session.id
      })
      .eq('id', leadId);

    if (error) {
      console.error('Failed to update lead with payment session', error);
    }

    return res.json({ success: true, url: session.url });
  } catch (err) {
    console.error('Stripe checkout error', err);
    return res.status(500).json({ success: false, message: 'Checkout failed' });
  }
});

app.post('/api/suggest-service', async (req, res) => {
  const description = String(req.body?.description || '').trim();
  if (!description) {
    return res.status(400).json({ success: false, message: 'Description required' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ success: false, message: 'AI not configured' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: SUGGESTION_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content:
              `Description: ${description}\n\n` +
              `Service list:\n${SERVICE_OPTIONS.map((option) => `- ${option}`).join('\n')}`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI request failed', errorText);
      return res.status(500).json({ success: false, message: 'Suggestion failed' });
    }

    const data = await response.json();
    const rawContent = data?.choices?.[0]?.message?.content?.trim() || '';
    const rawSuggestions = extractSuggestions(rawContent);
    const suggestions = buildSuggestionList(rawSuggestions);
    const prices = suggestions.reduce((acc, service) => {
      acc[service] = getServicePriceCents(service);
      return acc;
    }, {});

    res.json({ success: true, suggestions, prices });
  } catch (err) {
    console.error('OpenAI error', err);
    res.status(500).json({ success: false, message: 'Suggestion failed' });
  }
});

app.get('/payment-success', (_req, res) => {
  res.send(
    renderPaymentResultPage(
      'Payment confirmed',
      'Thank you! Your payment was received and your service request is confirmed.',
      'View lead form',
      '/form'
    )
  );
});

app.get('/payment-cancel', (_req, res) => {
  res.send(
    renderPaymentResultPage(
      'Payment canceled',
      'No charge was made. You can return to the form and try again whenever you are ready.',
      'Back to form',
      '/form'
    )
  );
});

app.get('/api/admin/leads', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to read leads', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    res.json({ success: true, data });
  } catch (err) {
    console.error('Supabase read error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/admin', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to read leads', error);
      return res.status(500).send('Server error');
    }
    res.send(renderAdminPage(data || [], req.adminUser || 'Admin'));
  } catch (err) {
    console.error('Supabase read error', err);
    res.status(500).send('Server error');
  }
});

// Only listen when running locally (not on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`United Field Services lead capture running at http://localhost:${PORT}`);
  });
}

// Export for Vercel serverless
module.exports = app;

function renderAdminPage(leads, signedInUser) {
  const total = leads.length;
  const paidLeads = leads.filter((l) => String(l.payment_status || '').toLowerCase() === 'paid').length;
  const pendingLeads = leads.filter((l) => String(l.payment_status || '').toLowerCase() === 'pending').length;
  const unpaidLeads = leads.filter((l) => {
    const status = String(l.payment_status || '').toLowerCase();
    return !status || status === 'unpaid';
  }).length;
  const revenueCents = leads.reduce((sum, lead) => {
    const status = String(lead.payment_status || '').toLowerCase();
    const amount = Number(lead.price_cents);
    if (status === 'paid' && Number.isFinite(amount)) {
      return sum + amount;
    }
    return sum;
  }, 0);
  const revenueLabel = revenueCents ? formatUsd(revenueCents) : '$0.00';

  const leadCards =
    leads.length === 0
      ? `<div class="no-leads">No leads captured yet.</div>`
      : leads
          .map((lead, index) => {
            const primaryService = lead.serviceneeded || '—';
            const description = lead.description || '—';
            const priceCents = Number(lead.price_cents);
            const priceLabel = Number.isFinite(priceCents) && priceCents > 0 ? formatUsd(priceCents) : '—';
            const paymentStatusRaw = String(lead.payment_status || '').toLowerCase();
            const paymentStatus =
              paymentStatusRaw === 'paid'
                ? 'Paid'
                : paymentStatusRaw === 'pending'
                ? 'Pending'
                : paymentStatusRaw === 'unpaid'
                ? 'Unpaid'
                : '—';
            const paymentClass =
              paymentStatusRaw === 'paid'
                ? 'paid'
                : paymentStatusRaw === 'pending'
                ? 'pending'
                : paymentStatusRaw === 'unpaid'
                ? 'unpaid'
                : 'unknown';

            const occupancyStatus = lead.occupancy_status || '';
            const entryMethod = lead.entry_method || '';
            const tenantName = lead.tenant_name || '';
            const tenantPhone = lead.tenant_phone || '';
            const tenantEmail = lead.tenant_email || '';
            const propertyAddress = lead.propertyaddress || '—';

            const occupancyBadge = occupancyStatus === 'vacant'
              ? '<span class="badge vacant">Vacant</span>'
              : occupancyStatus === 'occupied'
              ? '<span class="badge occupied">Occupied</span>'
              : '';

            return `
              <div class="lead-card" data-role="${lead.role}">
                <div class="lead-card-header">
                  <div class="lead-card-title">
                    <h3>${escapeHtml(lead.name || 'Unknown')}</h3>
                    <span class="badge payment ${paymentClass}">${paymentStatus}</span>
                    ${occupancyBadge}
                  </div>
                  <div class="lead-card-price">${priceLabel}</div>
                </div>

                <div class="lead-card-meta">
                  <span>${escapeHtml(lead.companyname || '')}</span>
                  <span class="muted">${escapeHtml(lead.created_at || '')}</span>
                </div>

                <div class="lead-card-grid">
                  <div class="lead-card-section">
                    <div class="lead-card-label">Contact</div>
                    <div class="lead-card-value">${escapeHtml(lead.email || '')}</div>
                    <div class="lead-card-value">${escapeHtml(lead.phone || '')}</div>
                  </div>
                  <div class="lead-card-section">
                    <div class="lead-card-label">Service</div>
                    <div class="lead-card-value">${escapeHtml(primaryService)}</div>
                  </div>
                </div>

                <div class="lead-card-section">
                  <div class="lead-card-label">Property Address</div>
                  <div class="lead-card-value">${escapeHtml(propertyAddress)}</div>
                </div>

                <div class="lead-card-section">
                  <div class="lead-card-label">Description</div>
                  <div class="lead-card-value lead-card-description">${escapeHtml(description)}</div>
                </div>

                ${occupancyStatus === 'vacant' && entryMethod ? `
                <div class="lead-card-section highlight">
                  <div class="lead-card-label">Entry Method</div>
                  <div class="lead-card-value">${escapeHtml(entryMethod)}</div>
                </div>
                ` : ''}

                ${occupancyStatus === 'occupied' && tenantName ? `
                <div class="lead-card-section highlight">
                  <div class="lead-card-label">Tenant Contact</div>
                  <div class="lead-card-value">${escapeHtml(tenantName)}</div>
                  <div class="lead-card-value">${escapeHtml(tenantPhone)}${tenantEmail ? ` • ${escapeHtml(tenantEmail)}` : ''}</div>
                </div>
                ` : ''}
              </div>
            `;
          })
          .join('');

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>United Field Services | Admin</title>
    <link rel="icon" type="image/jpeg" href="/united_field_services_inc_logo.jpeg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <header class="top-bar">
      <a class="brand brand-link" href="/">
        <img src="/united_field_services_inc_logo.jpeg" alt="United Field Services logo" class="brand-logo">
        <span class="brand-name">United Field Services Admin</span>
      </a>
      <div class="top-actions">
        <a class="admin-link" href="/form">Back to form</a>
        <a class="admin-link" href="/admin/logout">Log out</a>
        <span class="divider"></span>
        <span class="contact">Signed in as <strong>${escapeHtml(signedInUser || ADMIN_USER)}</strong></span>
      </div>
    </header>
    <main class="page">
      <section class="card">
        <div class="progress">Leads Overview</div>
        <h1>Lead inbox</h1>
        <p class="subtitle">Monitoring lead submissions, pricing, and payment status.</p>
        <div class="admin-stats">
          <div class="stat">
            <div class="label">Total leads</div>
            <div class="value">${total}</div>
          </div>
          <div class="stat">
            <div class="label">Paid leads</div>
            <div class="value">${paidLeads}</div>
          </div>
          <div class="stat">
            <div class="label">Pending payments</div>
            <div class="value">${pendingLeads}</div>
          </div>
          <div class="stat">
            <div class="label">Unpaid leads</div>
            <div class="value">${unpaidLeads}</div>
          </div>
          <div class="stat">
            <div class="label">Paid revenue</div>
            <div class="value">${revenueLabel}</div>
          </div>
        </div>
        <div class="leads-grid">
          ${leadCards}
        </div>
      </section>
    </main>
    <style>
      .leads-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
        gap: 16px;
        margin-top: 16px;
      }

      .no-leads {
        text-align: center;
        color: #757575;
        padding: 40px;
        grid-column: 1 / -1;
      }

      .lead-card {
        background: #fff;
        border: 1px solid var(--border);
        border-radius: var(--radius-panel);
        padding: 16px;
        transition: box-shadow 0.2s ease, transform 0.2s ease;
      }

      .lead-card:hover {
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        transform: translateY(-2px);
      }

      .lead-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 8px;
      }

      .lead-card-title {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .lead-card-title h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text);
      }

      .lead-card-price {
        font-size: 18px;
        font-weight: 700;
        color: var(--primary);
      }

      .lead-card-meta {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border);
      }

      .lead-card-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 12px;
      }

      .lead-card-section {
        margin-bottom: 10px;
      }

      .lead-card-section.highlight {
        background: #f8f9fa;
        padding: 10px;
        border-radius: 6px;
        border-left: 3px solid var(--primary);
      }

      .lead-card-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--muted);
        margin-bottom: 4px;
      }

      .lead-card-value {
        font-size: 13px;
        color: var(--text);
        word-break: break-word;
      }

      .lead-card-description {
        max-height: 60px;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
      }

      .badge.vacant {
        background: #e8f5e9;
        color: #2e7d32;
      }

      .badge.occupied {
        background: #fff3e0;
        color: #e65100;
      }

      @media (max-width: 720px) {
        .leads-grid {
          grid-template-columns: 1fr;
        }

        .lead-card-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </body>
  </html>`;
}

function renderPaymentResultPage(title, message, ctaLabel, ctaHref) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} | United Field Services</title>
    <link rel="icon" type="image/jpeg" href="/united_field_services_inc_logo.jpeg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <header class="top-bar">
      <a class="brand brand-link" href="/">
        <img src="/united_field_services_inc_logo.jpeg" alt="United Field Services logo" class="brand-logo">
        <span class="brand-name">United Field Services</span>
      </a>
      <div class="top-actions">
        <span class="contact">Need help? Call <a href="tel:8774639010">(877) 463-9010</a></span>
      </div>
    </header>
    <main class="page">
      <section class="card">
        <div class="progress">Payment Status</div>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(message)}</p>
        <div class="form-footer" style="justify-content:flex-start;">
          <a class="primary-btn" href="${ctaHref}">${escapeHtml(ctaLabel)}</a>
        </div>
      </section>
    </main>
  </body>
  </html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeServiceName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function extractSuggestions(rawContent) {
  if (!rawContent) return [];

  try {
    const parsed = JSON.parse(rawContent);
    if (Array.isArray(parsed?.suggestions)) {
      return parsed.suggestions.map((item) => String(item || '').trim()).filter(Boolean);
    }
  } catch (err) {
    // fall through to text parsing
  }

  return rawContent
    .split('\n')
    .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean);
}

function buildSuggestionList(rawSuggestions) {
  const results = [];
  const seen = new Set();

  rawSuggestions.forEach((item) => {
    const normalized = normalizeServiceName(item);
    const exact = SERVICE_MAP.get(normalized);
    if (!exact || seen.has(exact)) return;
    seen.add(exact);
    results.push(exact);
  });

  return results.slice(0, 5);
}
