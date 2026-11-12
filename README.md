# Minor Project

Minor Project is a college prototype of a rural marketplace, piloted with a seller in Kondagaon, Chhattisgarh. It includes an Expo web/Android app and a local Node marketplace API. See the [team handoff](MARKETPLACE_SPRINT_HANDOFF.md) for the sprint scope and the [transport API handoff](TRANSPORT_API_HANDOFF.md) for the teammate-owned matching service.

## Run locally

Requires Node.js and npm. Use two terminals:

```powershell
cd server
npm start
```

```powershell
cd frontend
$env:EXPO_PUBLIC_API_URL='http://localhost:4000'
npm run web
```

For Android Expo Go, install the [Expo Go build matching SDK 58](https://expo.dev/go) on the phone, then put the laptop and phone on the same Wi-Fi. Set `EXPO_PUBLIC_API_URL` to `http://<laptop-LAN-IP>:4000` before `npm start` in `frontend`, then scan Expo's QR code. A phone cannot reach the laptop API through `localhost`. The API listens on port 4000 by default; set `PORT` to change it. A local firewall may need to allow that port on the private network.

To use the friend's service, set `TRANSPORT_API_BASE_URL` in the **server** terminal, such as `http://localhost:4100`, before `npm start`. The frontend still calls only port 4000. Without this variable, the API returns one explicitly labeled sample transport match for the Kondagaon→Raipur fixture. The sample transporter number is fake and cannot be called.

## Seller UI

The seller area now has separate routes: **Dashboard** (`/seller`), **My products** (`/seller/inventory`), **Create listing** (`/seller/new`), **Saved drafts** (`/seller/drafts`), and **Order requests** (`/seller/orders`). The desktop view uses a sidebar; narrow screens use a scrollable navigation row. The dashboard counts and product/order cards come from the local demo API and saved drafts. Amazon Seller Central's dashboard and catalogue navigation informed the layout; branding and workflows are specific to this project.

## Registration and login

Marketplace browsing remains public. `/` shows the landing page; signed-in users are redirected to their buyer or seller dashboard. The **Register / Login** button opens authentication, where visitors choose **Customer** or **Seller**. Registration collects first/last names, email and an eight-character password; sellers also supply an Indian mobile number. Sellers can log in by email or phone. Logging in from a product page returns customers to that product.

Registered accounts and seven-day bearer sessions are stored in the configured Supabase PostgreSQL database. Passwords use scrypt hashes and session tokens are stored as SHA-256 hashes. Listing uploads, requests and reviews enforce account roles and ownership on the API. Frontend login state is still memory-only and is lost on reload. Account recovery and rate limiting remain unimplemented.

## Product pages and reviews

- Every product card opens `/product/:id`, with a large image, thumbnail gallery when available, product name, linked seller name, average customer rating, received units sold, price, optional seller description, stock and a dedicated order panel. Product grids measure their available width to keep columns equal; titles reserve two lines so prices and stock align.
- The 30 promoted sample products have two sourced illustrative images each, stored in PostgreSQL with source credits. The gallery displays attribution links and a sample-image notice. See [sample image scripts and sources](scripts/sample-images/README.md). Existing seller-created listings retain their original single photo unless a gallery is attached; multiple-photo management in the seller upload form remains future work.
- `/sellers/:id` is a public seller profile with the seller's name, join date and active products. It does not expose account email, phone or credentials.
- Suggestions prefer other in-stock products in the same category, then other marketplace products. They exclude the current product; no simulated recommendations or sales figures are inserted.
- Buyers send order requests from the product page, then follow the confirmation link to request details. Seller acceptance reduces stock atomically. Once the goods arrive, the owning buyer can **Confirm received** in **My requests → Request details**. This moves the request from `accepted` to `completed` without reducing stock again.
- Units sold are the sum of quantities on completed requests. This is buyer-confirmed receipt, not independently verified payment or delivery tracking.
- Only customers with a completed purchase of that product can submit a review. Each customer gets one review per product: 1–5 stars, required text (1–2,000 characters), and optionally up to three JPEG/PNG/WebP images of 1 MB each. Images and reviews save in one transaction. Reviews show the customer name, date, purchase badge and expandable photos. The API currently returns the latest 100 reviews; aggregate ratings include all reviews.
- Review text, ratings, images and eligibility persist in PostgreSQL. Photos are stored as database binary data for this prototype. Moderation, review editing and pagination are future work.

## Database setup

Create an ignored server environment file with DATABASE_URL set to the Supabase Session Pooler URI, then run this once after pulling the project:

```powershell
cd server
npm run db:migrate
```

The migration records its own completion in the schema_migrations table, so re-running it is safe. Run migrations after pulling schema changes. Migrations `003`–`005` add sessions, marketplace persistence, receipt confirmation and product reviews. Listings, listing photos, requests and reviews now persist in PostgreSQL; device drafts persist separately. Transport remains an independent service with a local sample fallback.

## Demo sequence

1. Open Seller → **Create listing**. Stop the marketplace API. Fill the three steps and take/choose one photo. Save the draft. Reload the app; the draft and photo should remain under **Saved drafts**.
2. Restart the API. Open **Saved drafts** and press **Upload saved drafts**. Open **My products** to see the published product, then open Buyer and refresh to see the listing and photo there.
3. Open a product card as a buyer and request a quantity from the product page. Open **Track your request**. Switch to Seller → **Order requests**, refresh and accept the original terms. Return to the buyer's request details and refresh. Once goods have been received, press **Confirm received**, then **Write a review** to add stars, text and optional photos. The public product page shows the review, updated rating and received units sold.
4. Open Find transport. The default sample route is Kondagaon→Raipur. Change pickup/drop road radius or weight to see match/no-match behavior. When the friend's service is connected, its results replace the sample fixture.

## Validation

```powershell
cd server
npm test
```

```powershell
cd frontend
npm run lint
npx tsc --noEmit
npx expo export --platform web
```

The API tests cover idempotent uploads, role/ownership checks, request transitions, stock reduction, public seller privacy, receipt confirmation, review eligibility/duplicates, image limits and image MIME validation.

The optional PostgreSQL integration test uses a fresh temporary schema, applies all migrations, checks concurrent acceptance and review transaction rollback, then drops only that schema. It requires the configured database user to create schemas:

```powershell
cd server
$env:RUN_DATABASE_TESTS='1'
node --test products.postgres.test.js
Remove-Item Env:RUN_DATABASE_TESTS
```

## Current boundaries

- This is a **local demo**, not a deployed marketplace. Marketplace records persist in Supabase PostgreSQL. Device drafts persist separately but currently share one storage key across seller accounts on that device. The Android and browser interaction flow still needs a live device/browser check; CLI typecheck, lint, export, and API tests do not prove it works on a phone.
- The seller and trip are fixtures. There is no field-worker authorization, Aadhaar verification, RTO lookup, payment, booking, or delivery tracking.
- English and Hindi main UI labels are present. Server error text and some fixture text still appear in English. Halbi and Gondi options currently display **provisional Hindi fallback with an explicit warning**; native-speaker translations are required before a real pilot. Do not present them as completed translations.
- Transport search uses sample coordinates and a sample result until the independent service is connected. Its phone number is intentionally fake. Do not describe the fixture distances as live routing measurements.
- The API enforces sessions, roles and request ownership, but retains permissive CORS and lacks rate limiting, account recovery and review moderation. Do not deploy it publicly in this state.
