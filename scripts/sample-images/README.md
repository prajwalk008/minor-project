# Sample product images

The 30 promoted `[SIM]` products have two illustrative images each. Images are fetched once, checked and stored in the main PostgreSQL database; the app serves them through its own photo API, so visitors do not depend on remote image hosts. Original placeholder photos and all business records are preserved.

`manifest.json` records the exact image sources, author/source credits, available license labels, checksums and local cache keys. Most sources are Wikimedia Commons. Some specific household and produce images are reference product photographs found through image search; those entries are labeled **Reference product photograph**, not asserted to have an open license. The UI labels all these images as illustrative and links their sources. They are sample catalogue illustrations, not seller-supplied photographs or proof of a particular product's material/appearance.

## Recreate the downloaded cache and install

From the repository root:

```powershell
node scripts/sample-images/download.mjs --from-manifest
npm --prefix server run db:migrate
node scripts/sample-images/install.mjs
node scripts/sample-images/install.mjs --apply
```

The first command reuses the frozen source manifest, avoiding a fresh search. Files are cached in ignored `server/data/product-images/files`. The installer first validates that all 30 products have 2–3 images and that cached file hashes match. Its default mode is a preview. `--apply` attaches photos and source credits to matching main-database sample listings in a single transaction. Existing accounts, order state, stock and old image records are left intact. `server/data/product-images/installation.json` records the resulting gallery IDs.

Migration `007_listing_gallery.sql` adds ordered gallery entries and attribution metadata. Restart the marketplace API after pulling code so product responses include `imageUrls` and `imageCredits`. The product page uses thumbnail selection; the first image is the card cover. Listings without a gallery still use their original single image. Seller-uploaded multiple-image management is outside this sample-data importer.

## Find replacement sources

`queries.json`, `discover.mjs` and `selection.json` record the original Commons searches and candidate selection. Discovery caches results, respects retry delays and spaces requests. Run discovery before the downloader's search mode if deliberately selecting new photos; the frozen-manifest mode is preferred for restoring this exact sample dataset.
