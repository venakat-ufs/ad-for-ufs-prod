# UFS Lead Capture - Project Documentation

## Project Overview
- **Name**: `ufs-lead-capture`
- **Version**: 1.0.0
- **Description**: United Field Services (UFS) marketing campaign lead capture mini-app for property maintenance services
- **Company**: United Field Services Inc. (unitedffs.com)
- **Phone**: (877) 463-9010
- **Email**: info@unitedffs.com
- **Type**: Full-stack Node.js/Express web application
- **Deployment**: Vercel (serverless via `vercel.json`)
- **Branch**: `main`

---

## Tech Stack
| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js |
| **Server** | Express.js |
| **Database** | Supabase (PostgreSQL) - table: `leads` |
| **Payments** | Stripe Checkout (cards, optional US bank account/ACH) |
| **AI/Suggestions** | OpenAI API (`gpt-4o-mini`) |
| **Geocoding** | Google Maps API + `zipcodes` npm package + OpenAI fallback |
| **Auth** | Supabase Auth (email/password, cookie-based sessions) |
| **Styling** | Custom CSS (Work Sans font, CSS variables) |
| **Deployment** | Vercel (`@vercel/node`) |
| **Frontend** | Vanilla HTML/CSS/JS (no framework) |

---

## Dependencies (`package.json`)
- `express` ^4.18.2 - HTTP server
- `@supabase/supabase-js` ^2.45.2 - Database & auth
- `stripe` ^20.1.2 - Payment processing
- `dotenv` ^16.4.5 - Environment variables
- `zipcodes` ^8.0.0 - Offline US ZIP code lookup

---

## Environment Variables Required
| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE` | Supabase service role key (server-side) |
| `SUPABASE_ANON_KEY` | Supabase anon key (client-side auth) |
| `STRIPE_SECRET_KEY` | Stripe secret key for payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification |
| `STRIPE_PAYMENT_METHODS` | Comma-separated payment methods (default: `card`) |
| `GOOGLE_MAPS_API_KEY` | Google Maps geocoding & Places autocomplete |
| `OPENAI_API_KEY` | OpenAI for service suggestions & ZIP lookup fallback |
| `APP_BASE_URL` | Base URL for Stripe redirect URLs |
| `PORT` | Server port (default: 3000) |

---

## File Structure
```
/
├── server.js                    # Main Express server (1359 lines) - ALL backend logic
├── ad.html                      # Landing page / marketing homepage (1167 lines)
├── package.json                 # Dependencies & scripts
├── vercel.json                  # Vercel deployment config
├── data/
│   └── leads.db                 # Local SQLite DB (unused - Supabase is used instead)
├── public/
│   ├── index.html               # Lead capture form (multi-step wizard)
│   ├── app.js                   # Client-side JS for form logic (1163 lines)
│   ├── styles.css               # Global CSS styles (1421 lines)
│   ├── admin-login.html         # Admin login page (Supabase Auth)
│   └── united_field_services_inc_logo.jpeg  # Company logo
```

---

## Pages & Routes

### Frontend Pages
| Route | File | Description |
|-------|------|-------------|
| `/` | `ad.html` | Marketing landing page with hero, services, FAQ, footer |
| `/form` | `public/index.html` | Multi-step lead capture form (3 sub-steps) |
| `/admin/login` | `public/admin-login.html` | Admin login page |
| `/admin` | Server-rendered | Admin dashboard showing all leads |
| `/payment-success` | Server-rendered | Payment confirmation page |
| `/payment-cancel` | Server-rendered | Payment cancellation page |

### API Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/leads` | None | Submit a new lead |
| GET | `/api/service-price` | None | Get price for a service |
| GET | `/api/service-descriptions` | None | Get service descriptions/tooltips |
| POST | `/api/suggest-service` | None | AI-powered service suggestion from description |
| POST | `/api/geocode` | None | Geocode ZIP/address to city/state |
| POST | `/api/reverse-geocode` | None | Reverse geocode lat/lng to city/state/zip |
| POST | `/api/lookup-zipcode` | None | AI-powered ZIP code lookup from address |
| GET | `/api/maps-config` | None | Get Google Maps API key for frontend |
| GET | `/api/supabase-config` | None | Get Supabase URL & anon key for frontend |
| POST | `/api/create-checkout-session` | None | Create Stripe checkout session |
| POST | `/api/stripe-webhook` | Stripe sig | Handle Stripe payment webhooks |
| GET | `/api/admin/leads` | Auth | Get all leads (JSON) |
| GET | `/admin` | Auth | Admin dashboard page |
| GET | `/admin/logout` | None | Clear auth cookies & redirect |

---

## Services Catalog (22 services)

### Plumbing
| Service | Price |
|---------|-------|
| Plumbing Diagnostic | $175 |
| Toilet Clog Removal | $395 |
| Drain Clog Clearing | $350 |
| Leak Stop / Emergency Water Shutoff | $225 |
| Water Heater Diagnostic | $175 |

### Electrical
| Service | Price |
|---------|-------|
| Electrical Diagnostic | $295 |
| Outlet or Switch Replacement | $295 |
| Smoke or CO Detector Replacement | $295 |
| GFCI Outlet Test & Replacement | $295 |

### HVAC
| Service | Price |
|---------|-------|
| HVAC Diagnostic | $175 |
| Thermostat Replacement | $495 |
| HVAC Filter Replacement | $165 |

### Appliances
| Service | Price |
|---------|-------|
| Appliance Diagnostic | $165 |
| Garbage Disposal Jam | $199 |
| Dishwasher Not Draining / Leak Check | $185 |

### Doors & Security
| Service | Price |
|---------|-------|
| Lock Rekey or Lock Repair | $160 |
| Door Adjustment / Alignment | $195 |
| Deadbolt Installation | $295 |

### General Services
| Service | Price |
|---------|-------|
| Caulking Repair | $299 |
| Pest Control Visit | $399 |
| Handyman - 1 Hour | $160 |
| Repair Bid / Estimate | $195 |

**Fallback price**: $195 (for unknown services)

---

## Lead Capture Form Flow

### Step 1: Role Selection
- Only "Property Owner / Manager" (client) role available
- Auto-selects client role from URL param `?role=client`

### Step 2: Multi-step Form (3 sub-steps)

**Sub-step 1: Describe The Issue**
- Service description textarea (with quick-fill chip buttons: Plumbing, Electrical, Cleaning, Debris, Lock Change, Inspection, Other)
- AI-powered service recommendation (auto-triggers after 700ms typing pause)
- Suggestion grid showing recommended services with prices
- Service dropdown with all 22 services + prices
- Service info tooltip (best for / description)

**Sub-step 2: Enter Property Details**
- "Use My Location" button (browser geolocation + reverse geocode)
- Street address with Google Places Autocomplete
- Apt/Suite, City, State, ZIP fields
- Auto-fills city/state from ZIP via geocode API
- AI fallback for ZIP lookup when Google doesn't return it
- Name, Email, Phone, Company Name fields

**Sub-step 3: Property Access & Payment**
- Occupancy status toggle (Vacant / Occupied)
  - If Vacant: Entry method chips (Lockbox, Key under mat, Code entry, Other) + instructions textarea
  - If Occupied: Tenant contact details (Name, Phone, Email)
- Price summary display
- Important notice about additional work authorization
- "Book & Pay" button -> submits lead then redirects to Stripe Checkout

---

## Database Schema (Supabase `leads` table)
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| created_at | timestamp | Auto-generated |
| role | text | Always "client" |
| name | text | Contact name |
| email | text | Contact email |
| phone | text | Contact phone |
| companyname | text | Company name |
| propertyaddress | text | Full formatted address |
| description | text | Issue description |
| serviceneeded | text | Selected service name |
| appointmentdate | text | (Unused currently) |
| occupancy_status | text | "vacant" or "occupied" |
| entry_method | text | Entry instructions (if vacant) |
| tenant_name | text | Tenant name (if occupied) |
| tenant_phone | text | Tenant phone (if occupied) |
| tenant_email | text | Tenant email (if occupied) |
| price_cents | integer | Price in cents |
| currency | text | "usd" |
| payment_status | text | "unpaid", "pending", or "paid" |
| payment_session_id | text | Stripe session ID |
| payment_intent_id | text | Stripe payment intent ID |
| paid_at | timestamp | When payment was confirmed |

---

## Payment Flow
1. User fills form and clicks "Book & Pay"
2. Lead is created in Supabase with `payment_status: "unpaid"`
3. Server creates Stripe Checkout session with lead ID in metadata
4. Lead updated to `payment_status: "pending"` with session ID
5. User redirected to Stripe Checkout
6. On success: Stripe webhook fires `checkout.session.completed`
7. Webhook updates lead to `payment_status: "paid"` with payment intent ID and timestamp

---

## Admin Dashboard
- Protected by Supabase Auth (email/password login)
- Cookie-based session (`sb-access-token`, `sb-refresh-token`)
- Shows stats: Total leads, Paid leads, Pending payments, Unpaid leads, Paid revenue
- Card-based layout showing each lead with: name, company, contact, service, address, description, payment status, price, occupancy info, tenant details
- Server-side rendered HTML (in `renderAdminPage()` function)

---

## Landing Page (`ad.html`)
- Fixed transparent header (turns white on scroll)
- Hero section with gradient overlay on property image
- Portal panel linking to `/form?role=client`
- 6 service cards: Repairs, Cleaning, Landscaping, HVAC, Electrical, Painting
- "Why Choose Us" section: Nationwide Network, Customized Plans, Quick Response, Licensed & Qualified
- FAQ accordion (4 questions)
- Footer with quick links, services, contact info, social media links
- Mobile: WhatsApp floating button, hamburger menu
- Desktop: Floating quick callback form (removed from current version)

---

## Design System
- **Font**: Work Sans (400, 500, 600, 700, 800 weights)
- **Primary Color**: `#BA2A34` (red)
- **Accent Color**: `#2f6fe0` (blue) - used for active steps and focus states
- **Border Radius**: 10px (cards/panels), 6px (controls), 999px (badges/chips)
- **Shadows**: Subtle layered box-shadows

---

## Git History (4 commits)
1. `99d3da6` - Initial commit - UFS Lead Capture
2. `e9a64c2` - Update services to property manager catalog with prices
3. `b37a985` - Improve AI service suggestions and simplify dropdown
4. `27ebcbc` - Update services catalog and add UI improvements

---

## Key Architecture Notes
- **Single server file**: All backend logic lives in `server.js` (~1359 lines) including API routes, Stripe webhooks, admin page rendering, and helper functions
- **No frontend framework**: Pure vanilla HTML/CSS/JS
- **AI integration**: OpenAI `gpt-4o-mini` used for 3 purposes:
  1. Service suggestion from issue description
  2. ZIP code lookup fallback
  3. Location data enrichment fallback
- **Geocoding cascade**: `zipcodes` npm (offline) -> Google Maps API -> OpenAI fallback
- **Auth**: Supabase Auth with cookie-based sessions (not JWT headers)
- **SSR admin**: Admin page is fully server-rendered HTML (not a SPA)
- **No test files**: No tests exist in the project

---

## What's Working
- Lead capture form with 3-step wizard flow
- AI-powered service recommendations
- Google Places address autocomplete
- Geolocation (Use My Location)
- Stripe payment integration with webhooks
- Admin dashboard with auth
- Responsive design (mobile + desktop)
- Landing page with navigation

## Potential Improvements / Missing
- No automated tests
- No `.env.example` file
- `data/leads.db` exists but is unused (Supabase is the actual DB)
- No rate limiting on public API endpoints
- No input sanitization middleware (relies on Supabase parameterized queries)
- Admin page is SSR only - no client-side filtering/search
- No email notifications when leads are submitted
- No appointment scheduling integration
- Footer shows "2025" copyright year
