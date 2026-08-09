# Qavyo Website — Page List (from Epos Now Sitemap)

> Pages extracted from `https://www.eposnow.com/sitemap.xml` (UK locale).
> Grouped by section for easy prioritization. Focus on **Core Pages** first.

---

## 🔧 Build Workflow

Each page is built from a saved copy of the original page's HTML.

1. Open the Epos Now URL in a browser → **View Source** (`Ctrl+U`) → select all → copy.
   (Or `Ctrl+S` → "Webpage, HTML Only" and open the saved file.)
2. Paste it into the matching file in **`raw/`** — the placeholder is already there,
   overwrite the whole file.
3. Run the builder:

   ```
   node build.js                 # build every raw page that has content
   node build.js retail-pos      # build just one page
   node build.js --no-download   # skip asset fetching
   ```

Every run ends with a verification pass over what it just wrote: each local asset
reference and page link must resolve, or the build prints `VERIFY FAILED` and
exits non-zero. It also lists any page no other page links to — sometimes that is
correct, sometimes it means the page's URL in `pages.json` is wrong.

The builder does five things automatically:

- **Assets** — downloads every image, font, stylesheet and script referenced
  from `eposnow.com` into `Qavyo-images/` and repoints
  `src`/`href`/`srcset`/`url()` at the local copy. Stylesheets and scripts are
  processed recursively: a stylesheet's own `url(../images/...)` references are
  pulled down and flattened, and the scripts the bundle lazy-loads at runtime
  (`"".concat(base, "/js/forms.js")`) are found and rewritten too.
- **Links** — rewrites internal `/uk/...` links to the local `.html` file that
  covers them (per `pages.json`); anything not yet built becomes `#` and is
  listed in the build output.
- **Tracking** — strips the Google Tag Manager container, the Cloudflare
  Insights beacon, and the LeadGen form loaders (which would have posted
  visitors' form submissions into Epos Now's lead system). Outbound links to any
  Epos Now property — other locales, support portal, socials, Trustpilot, the
  country switcher — are neutralised to `#`, and the endpoints inside
  `form-secure.js` are pointed at a dead local path.
- **Branding** — replaces `Epos Now` → `Qavyo` (and `EPOS NOW` → `QAVYO`),
  leaving local asset paths untouched (some filenames contain the old name).
- **Logo** — swaps the original logo and favicons for the Qavyo mark. The
  replacement files are built by `make_logo.py` from `brand/logo.png`;
  rerun that script if the source logo changes.

`raw/` holds the untouched originals, so a rebuild is always safe and repeatable.
Never edit the built page at the root by hand — edit `raw/` and rebuild, or the
next build overwrites your change.

To add a page not in `pages.json`: add an entry (`name`, `src`, `file`), then
create the `raw/` file and paste. Adding it to `pages.json` is also what makes
other pages' links to it resolve instead of falling back to `#`.

**A page usually answers to more than one URL.** The footer links the Terms page
as `/uk/contact-us/about/terms-website/` while the sitemap calls it `/uk/terms/`.
Put the URL the site actually links in `src`, and list the rest under `aliases`:

```json
{ "name": "Terms", "src": "/uk/contact-us/about/terms-website/",
  "file": "terms.html", "aliases": ["/uk/terms/"] }
```

Miss one and every link using that form quietly becomes `#`.

### Files and folders

| Path | What it is |
|------|-----------|
| `raw/` | Untouched pasted page source. The input; safe to rebuild from. |
| `*.html` | Built pages. **Never edit these** — the next build overwrites them. |
| `Qavyo-images/` | Every downloaded asset, flattened. Build output. |
| `Qavyo-images/assets.manifest.json` | Which remote URL each local filename came from. Keeps names stable between builds and lets colliding filenames be told apart. Don't hand-edit. |
| `brand/logo.png` | Your source logo. Deliberately outside `Qavyo-images/`, so a downloaded asset can never overwrite it. |
| `make_logo.py` | Builds the site logo and favicons from `brand/logo.png`. Rerun after changing it. |

### Known gaps

**Contact details.** The pages still carry Epos Now's email addresses
(`info@`, `data.requests@`, `customerrelations@`) and a few plain-text mentions
of their domain. These can't be derived automatically, so the build reports them
instead of guessing. Fill in `BRAND` at the top of `build.js` with the real
domain and inboxes, then rebuild.

**`icon-payroll.svg`** 404s on the origin. It is referenced by `style.css` only
through `.features__item--payroll`, a class no page actually uses. The build
substitutes a transparent pixel so nothing requests a missing file.

**`api.html` and `restaurant-software.html` are not linked from any other page.**
That mirrors the original site — neither is in its navigation; they are reached
from the app listing, which loads dynamically. The pages themselves are complete.
Add an entry to a nav or listing page if you want them reachable by clicking.

**`safari-pinned-tab.svg`** is still the original mark. It is a monochrome
vector mask, which can't be generated from the supplied PNG logo — it only
appears on pinned tabs in Safari.

**YouTube embeds** (3 across the site) still point at Epos Now's channel. They
are page content rather than tracking, so they were left in; removing them would
leave empty players.

**Form endpoints.** Every form posts to a server-side path (`/form/LeadForm/`
and friends) that doesn't exist on a static site, so submissions will fail. That
is inherent to a static copy, not something the build can fix.

---

## 🟢 Priority 1 — Core Pages (Build These First)

| Page | Epos Now URL | Local file | Status |
|------|-------------|-----------|--------|
| **Homepage** | `/uk/` | `index.html` | ✅ Done |
| **Retail POS** | `/uk/systems/retail-pos/` | `retail-pos.html` | ✅ Done |
| **Hospitality POS / Restaurant** | `/uk/systems/hospitality-pos/restaurant/` | `restaurant.html` | ✅ Done |
| **Restaurant POS Software** | `/uk/systems/hospitality-pos/restaurant/software/` | `restaurant-software.html` | ✅ Done |
| **Pricing / Get a Quote** | `/uk/store/software/` | `pricing.html` | ✅ Done |
| **App Store / Integrations** | `/uk/store/software/apps/` | `app-store.html` | ✅ Done |
| **API** | `/uk/store/software/apps/api/` | `api.html` | ✅ Done |
| **Website Builder** | `/uk/store/software/apps/website-builder/` | `website-builder.html` | ✅ Done |
| **About Us** | `/uk/contact-us/about/` | `about.html` | ✅ Done |
| **Contact Us** | `/uk/contact-us/` | `contact-us.html` | ✅ Done |
| **Privacy Policy** | `/uk/contact-us/about/privacy-policy/` | `privacy-policy.html` | ✅ Done |
| **Careers** | `/uk/careers/` | `careers.html` | ✅ Done |

---

## 🔵 Priority 2 — Linked From Homepage Nav / Footer

These are already linked from the built homepage, so they are worth doing early.

| Page | Epos Now URL | Local file | Status |
|------|-------------|-----------|--------|
| **Systems overview** | `/uk/systems/` | `systems.html` | ✅ Done |
| **Payment Processing** | `/uk/payment-processing/` | `payment-processing.html` | ✅ Done |
| **Enterprise** | `/uk/enterprise/` | `enterprise.html` | ✅ Done |
| **Support** | `/uk/contact-us/support/` | `support.html` | ✅ Done |
| **Resources / Blog listing** | `/uk/resources/` | `blog.html` | ✅ Done |
| **Terms** | `/uk/contact-us/about/terms-website/` | `terms.html` | ✅ Done |
| **Cookie Policy** | `/uk/contact-us/about/cookie-policy/` | `cookie-policy.html` | ✅ Done |
| **Retail POS — Barber Shop** | `/uk/systems/retail-pos/barber-shop/` | `barber-shop.html` | ✅ Done |
| **Hardware Accessories — Till Roll** | `/uk/store/hardware/accessories/pro-pos-till-roll/` | `till-roll.html` | ✅ Done |

---

## 🟣 Priority 2b — Rest of the Nav Menu

Every remaining destination in the header menu.  and the 
placeholders already exist — paste the page source and rebuild. Until then
the menu links to them stay .

| Page | Epos Now URL | Local file | Status |
|------|-------------|-----------|--------|
| **Testimonials** | `/uk/about-us/testimonials/` | `testimonials.html` | ⬜ Todo |
| **All Industries** | `/uk/all-industries/` | `all-industries.html` | ⬜ Todo |
| **Build Your System** | `/uk/build-your-system/` | `build-your-system.html` | ⬜ Todo |
| **Partnerships** | `/uk/contact-us/partnerships/` | `partnerships.html` | ⬜ Todo |
| **Sales** | `/uk/contact-us/sales/` | `sales.html` | ⬜ Todo |
| **Countertop 2** | `/uk/countertop-2/` | `countertop-2.html` | ⬜ Todo |
| **Qavyo Capital** | `/uk/epos-now-capital/` | `qavyo-capital.html` | ⬜ Todo |
| **Air Device** | `/uk/payment-processing/air-device/` | `air-device.html` | ⬜ Todo |
| **Card Machines** | `/uk/payment-processing/card-machines/` | `card-machines.html` | ⬜ Todo |
| **Qavyo Payments Lite** | `/uk/payment-processing/epos-now-payments-lite/` | `qavyo-payments-lite.html` | ⬜ Todo |
| **Link Card Reader** | `/uk/payment-processing/link-card-reader/` | `link-card-reader.html` | ⬜ Todo |
| **Mobile Portable** | `/uk/payment-processing/mobile-portable/` | `mobile-portable.html` | ⬜ Todo |
| **Pay By Link** | `/uk/payment-processing/pay-by-link/` | `pay-by-link.html` | ⬜ Todo |
| **POS Comparisons** | `/uk/pos-comparisons/` | `pos-comparisons.html` | ⬜ Todo |
| **Press** | `/uk/press/` | `press.html` | ⬜ Todo |
| **Accessories** | `/uk/store/hardware/accessories/` | `accessories.html` | ⬜ Todo |
| **Caller ID** | `/uk/store/hardware/accessories/caller-id/` | `caller-id.html` | ⬜ Todo |
| **Pro Cash Drawer** | `/uk/store/hardware/accessories/pro-cash-drawer/` | `pro-cash-drawer.html` | ⬜ Todo |
| **POS Barcode Scanners** | `/uk/store/hardware/pos-barcode-scanners/` | `pos-barcode-scanners.html` | ⬜ Todo |
| **POS Printers** | `/uk/store/hardware/pos-printers/` | `pos-printers.html` | ⬜ Todo |
| **Deputy** | `/uk/store/software/apps/deputy/` | `deputy.html` | ⬜ Todo |
| **Qavyo Delivery** | `/uk/store/software/apps/epos-now-delivery/` | `qavyo-delivery.html` | ⬜ Todo |
| **Kitchen Display System** | `/uk/store/software/apps/kitchen-display-system/` | `kitchen-display-system.html` | ⬜ Todo |
| **Loyalty** | `/uk/store/software/apps/loyalty/` | `loyalty.html` | ⬜ Todo |
| **Loyalzoo** | `/uk/store/software/apps/loyalzoo/` | `loyalzoo.html` | ⬜ Todo |
| **Mailchimp** | `/uk/store/software/apps/mailchimp/` | `mailchimp.html` | ⬜ Todo |
| **My Business** | `/uk/store/software/apps/my-business/` | `my-business.html` | ⬜ Todo |
| **Opentable** | `/uk/store/software/apps/opentable/` | `opentable.html` | ⬜ Todo |
| **Order And Pay** | `/uk/store/software/apps/order-and-pay/` | `order-and-pay.html` | ⬜ Todo |
| **Quickbooks** | `/uk/store/software/apps/quickbooks/` | `quickbooks.html` | ⬜ Todo |
| **Shopify** | `/uk/store/software/apps/shopify/` | `shopify.html` | ⬜ Todo |
| **Xero** | `/uk/store/software/apps/xero/` | `xero.html` | ⬜ Todo |
| **Success Stories** | `/uk/success-stories/` | `success-stories.html` | ⬜ Todo |
| **Hospitality POS** | `/uk/systems/hospitality-pos/` | `hospitality-pos.html` | ⬜ Todo |
| **Bakery** | `/uk/systems/hospitality-pos/bakery/` | `bakery.html` | ⬜ Todo |
| **Bar** | `/uk/systems/hospitality-pos/bar/` | `bar.html` | ⬜ Todo |
| **Cafe** | `/uk/systems/hospitality-pos/cafe/` | `cafe.html` | ⬜ Todo |
| **Hotel** | `/uk/systems/hospitality-pos/hotel/` | `hotel.html` | ⬜ Todo |
| **Takeaway** | `/uk/systems/hospitality-pos/takeaway/` | `takeaway.html` | ⬜ Todo |
| **Beauty Salon** | `/uk/systems/retail-pos/beauty-salon/` | `beauty-salon.html` | ⬜ Todo |
| **Clothing Store** | `/uk/systems/retail-pos/clothing-store/` | `clothing-store.html` | ⬜ Todo |
| **Convenience Store** | `/uk/systems/retail-pos/convenience-store/` | `convenience-store.html` | ⬜ Todo |
| **Grocery Store** | `/uk/systems/retail-pos/grocery-store/` | `grocery-store.html` | ⬜ Todo |
| **Vape Shop** | `/uk/systems/retail-pos/vape-shop/` | `vape-shop.html` | ⬜ Todo |
| **Tablet POS** | `/uk/systems/tablet-pos/` | `tablet-pos.html` | ⬜ Todo |

---

## 🟡 Priority 3 — Support / Onboarding Pages

| Page | Epos Now URL | Status |
|------|-------------|--------|
| **Welcome — Stock Management** | `/uk/welcome/stock-management/4-1-adding-suppliers/` | ⬜ Todo |
| **Careers — Customer Service Rep** | `/uk/careers/customer-service-representative/` | ⬜ Todo |

---

## 📰 Priority 4 — Blog / Resources (100+ articles)

> These are content/SEO articles. Build a **Blog listing page** + a **single article template** first.

### Sample Resource Articles

| Article | URL Slug |
|---------|----------|
| Essential Retail POS Features | `essential-retail-pos-features` |
| What is a POS Report? | `what-is-a-pos-report` |
| What is POS Security? | `what-is-pos-security` |
| How to Use a POS System | `how-to-use-a-pos-system` |
| How Much Does a POS System Cost? | `how-much-does-a-pos-system-cost` |
| Different Types of POS Systems | `different-types-of-pos-systems` |
| How to Accept Credit Card Payments | `how-to-accept-credit-card-payments` |
| How Does Payment Processing Work | `how-does-payment-processing-work` |
| What is a Merchant Account? | `what-is-a-merchant-account` |
| Integrate Accounts with Your POS | `integrate-accounts-with-your-pos` |
| What is Omnichannel in Retail? | `what-is-omnichannel-in-retail` |
| Business Growth Strategies | `business-growth-strategies` |
| Business Sustainability Strategies | `business-sustainability-strategies` |
| How to Make Gift Cards for Your Business | `how-to-make-gift-cards-for-your-business` |
| What is a Good Inventory Turnover Ratio? | `what-is-a-good-inventory-turnover-ratio-for-retail` |
| How to Get a QR Code for Your Business | `how-to-get-a-qr-code-for-your-business` |
| Which Credit Card Processing is Cheapest? | `which-credit-card-processing-is-cheapest-for-small-business` |
| Restaurant Profit Margins | `everything-you-need-to-know-about-restaurant-profit-margins` |
| How to Increase Food Delivery Sales | `how-to-increase-food-delivery-sales-for-your-restaurant` |
| Restaurant Seating Strategy | `restaurant-seating-strategy` |
| Restaurant Goals | `restaurants-goals` |
| Menu Pricing Strategies | `menu-pricing-strategies` |
| How to Reduce Waiting Time in Restaurants | `how-to-reduce-waiting-time-in-restaurants` |
| Coffee Shop EPOS | `coffee-shop-epos` |
| Market Size for Coffee Shops | `market-size-for-coffee-shops` |
| POS Software with QuickBooks | `pos-software-that-integrates-with-quickbooks` |
| Liquor Store Profit Margins | `liquor-store-profit-margins` |
| How to Start a Boutique | `how-to-start-a-boutique` |
| Markup vs Margin | `markup-vs-margin-which-should-you-use` |
| What Are the Most Profitable Small Businesses? | `what-are-the-most-profitable-small-businesses` |
| What is a Business Structure? | `what-is-a-business-structure` |
| Rewards & Loyalty Programs | `rewards-loyalty-programs-do-they-really-work` |
| Year-End Inventory | `how-to-do-year-end-inventory-for-your-store` |
| How to Start a Candle Business | `how-to-start-a-candle-business` |
| Point of Sale vs Point of Purchase | `point-of-sale-vs-point-of-purchase` |
| How to Analyse Your EPOS Data | `how-to-analyse-your-epos-data` |
| What is Shrink in Retail? | `what-is-shrink-in-retail` |
| Opening a New Branch | `opening-a-new-branch` |
| Payment Terms | `payment-terms` |
| How to Use a Till (UK) | `how-to-use-a-till-uk` |
| How Much Does a Card Machine Cost? | `how-much-does-a-card-machine-cost` |
| VAT Threshold | `what-is-vat-threshold` |
| What is a Merchant Acquirer? | `what-is-a-merchant-acquirer` |
| Accept Payments Online | `accept-payments-online` |

---

## 📣 Priority 5 — Press / News

| Article | URL |
|---------|-----|
| Epos Now Launches New Financing Solution | `/uk/resources/epos-now-launches-new-financing-solution-smes/` |
| Regional Warehouse in Madrid | `/uk/press/epos-now-launches-new-regional-warehouse-in-madrid-spain/` |
| Push Into South America | `/uk/resources/epos-now-launches-push-south-america/` |
| Hospitality VAT News | `/uk/news/hospitality-and-tourism-sectors-call-on-chancellor-to-keep-lower-rate-of-vat/` |
| Budget 2021 Hospitality Business Rates | `/uk/news/budget-2021-rishi-sunak-announces-hospitality-business-rates-discount-national-insurance-changes-and-return-to-20-vat/` |

---

## 📋 Recommended Build Order

1. ✅ **Homepage** — Done
2. ⬜ **Retail POS page** — Core product page
3. ⬜ **Hospitality POS / Restaurant page** — Core product page
4. ⬜ **App Store / Integrations page**
5. ⬜ **Pricing / Software page**
6. ⬜ **About Us page**
7. ⬜ **Contact Us page**
8. ⬜ **Blog listing page + article template** — Then populate with articles
9. ⬜ **Industry sub-pages** (Barber Shop, etc.)
10. ⬜ **Legal pages** (Privacy Policy, etc.)
