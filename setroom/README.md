# SetRoom

SetRoom is a display-first web app for LEGO collectors. Its main experience is deliberately simple:

1. Search for a set.
2. See the real box artwork and physical dimensions.
3. Check whether it fits.
4. Place and rearrange the box on a measured 3D shelf.

## Live path

The app is published from this repository under `/setroom/`:

`https://dobstar2.github.io/weather-visualization-app/setroom/`

## The redesigned shelf studio

- Browser-native 3D shelving with six-sided shelf boards and box cuboids
- Slightly elevated front camera with rotate, zoom, front-view and reset controls
- Real product artwork mapped onto each visible box front
- Different box sizes based on stored dimensions
- Front/back placement using shelf depth as well as width and height
- Collision detection while adding, moving or rotating boxes
- Automatic best-shelf recommendation with remaining width, depth and height
- Direct box selection and drag-to-move interaction
- Clear selected-box inspector for changing shelf, rotating or removing a box
- Animated placement preview and success/error feedback
- Responsive layout with simplified controls and bottom navigation on mobile
- Local persistence through `localStorage`

The visual system uses a clean white product canvas, purposeful primary colours, strong type hierarchy and small brick-inspired details. It does not imitate LEGO's site or branding pixel-for-pixel.

## Existing product tools retained

- Collection catalogue with owned, wanted and sold states
- Actual product-image URLs and custom-set placeholders
- Purchase price, condition, dates, notes and build progress
- Build timer, session history and optional browser camera recording
- Selling fee, fulfilment, net proceeds and profit calculations
- Listing draft and selling-photo checklist
- Budget, theme and shelf-space purchase recommendations
- JSON backup and restore
- Seven-day local Pro trial
- Installable web app and offline application shell

## Run and validate locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173/#app/studio`.

Static checks:

```bash
node --check app.js
node --check shelf3d.js
node --check data.js
node --check sw.js
node tests/smoke.js
```

## Product model

The collection and manual shelf experience are free. The current founding offer presents SetRoom Pro at **£29 per year** for auto-arrange, build replay, selling tools and purchase recommendations.

Eighteen annual customers at that price produce **£522 gross revenue** before payment fees, tax, refunds, acquisition, support and other costs. This is a commercial target, not a guarantee of sales or profit.

## Checkout and paid access

Set `checkoutUrl` in `config.js` to a hosted Stripe, Lemon Squeezy or equivalent checkout.

A checkout link alone cannot securely enforce paid access on GitHub Pages. A commercial release needs provider-backed licence validation or a small backend before unlocking Pro.

## Data, images and trademarks

Collection data is stored locally in the browser. Camera access begins only after the user explicitly starts it.

Product artwork currently loads from Brickset-hosted URLs. Confirm the intended commercial usage rights or move to a licensed catalogue/image pipeline before charging customers.

SetRoom is an independent fan-made collector tool. It is not affiliated with, endorsed by or sponsored by the LEGO Group. LEGO and related marks belong to their respective owner.
