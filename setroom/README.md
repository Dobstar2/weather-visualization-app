# SetRoom

SetRoom is a display-first web app for LEGO collectors. The free layer catalogues owned, wanted and sold sets. The paid layer is built around four decisions that can save a collector money or remove substantial friction:

- **BrickSpace** — measure shelves, test normal and rotated fit, place sets to scale and auto-arrange the room.
- **BuildReplay** — time build sessions, track progress and record a local camera replay.
- **BrickExit** — calculate fees, fulfilment, take-home money and actual profit before selling.
- **BrickBrain** — rank the next purchase using budget, favourite themes, wishlist intent and current display space.

## Live path

This project is designed to be published from the existing GitHub Pages repository under:

`/setroom/`

The expected public address is:

`https://dobstar2.github.io/weather-visualization-app/setroom/`

## Product model

The catalogue remains free. SetRoom Pro is presented at a founding price of **£29 per year**.

Eighteen annual customers at that price produce **£522 gross revenue** before payment fees, tax, refunds, customer acquisition, support and other costs. The product does not guarantee sales or profit.

## What is implemented

- Responsive marketing site and product tour
- Free collection catalogue with real set box-image URLs
- Owned, wishlist and sold states
- Price paid, condition, acquisition date, notes and build progress
- Shelf dimensions, placements, orientation-aware fit checks and auto-arrange
- Build timer, session history and optional browser camera recording
- Sale fee, postage, packaging, net and profit calculations
- Listing draft and photo checklist
- Budget, theme and shelf-space purchase ranking
- Avengers Tower profit goal dashboard
- Local JSON export and import
- Installable web-app manifest and offline shell
- Seven-day local product trial

## Run locally

From this folder:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173/`.

## Connect checkout

Edit `config.js`:

```js
window.SETROOM_CONFIG = {
  annualPrice: '£29',
  checkoutUrl: 'PASTE_CHECKOUT_URL_HERE',
  supportEmail: 'you@example.com',
  productName: 'SetRoom Pro'
};
```

A Stripe Payment Link, Lemon Squeezy checkout or another hosted checkout can be used for the button. A static checkout link alone does **not** securely enforce paid access.

For a real commercial launch, validate subscription or licence status through a small backend or payment-provider licence API. The local trial and `licensed` flag in this repository are product demonstrations, not secure entitlements.

## Data and privacy

Collection data is stored in browser `localStorage`. Camera access is requested only after the user presses **Start camera**. Recorded video is held in a temporary browser object URL and must be downloaded before the tab is closed or refreshed.

A production version should add accounts, cloud sync, privacy documentation, data-deletion controls and a secure entitlement service.

## Images and trademarks

Set image URLs currently point to Brickset-hosted images and are credited in the interface. Confirm that the chosen image/data source permits the intended commercial use before launch; a licensed catalogue API or your own authorised image pipeline is preferable for a paid product.

SetRoom is an independent fan-made collector tool. It is not affiliated with, endorsed by or sponsored by the LEGO Group. LEGO and related marks belong to their respective owner.
