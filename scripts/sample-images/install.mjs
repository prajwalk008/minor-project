import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { databasePool, closeDatabasePool } from '../../server/db.js';

const manifest = JSON.parse(await readFile('scripts/sample-images/manifest.json', 'utf8'));
if (manifest.length !== 30 || new Set(manifest.map(item => item.product)).size !== 30) throw new Error('A complete manifest for all 30 sample products is required');
for (const product of manifest) {
  if (product.images.length < 2 || product.images.length > 3) throw new Error(`Expected 2–3 images for ${product.product}`);
  for (const image of product.images) {
    if (!/^[a-f0-9]{24}$/.test(image.key)) throw new Error('Invalid cached image key');
    image.bytes = await readFile(resolve('server/data/product-images/files', image.key + '.bin'));
    if (createHash('sha256').update(image.bytes).digest('hex') !== image.sha256) throw new Error(`Image hash mismatch for ${product.product}`);
  }
}
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ products: manifest.length, images: manifest.reduce((count, item) => count + item.images.length, 0), mode: 'Preview; use --apply to add the images to public sample listings' }));
} else {
  const db = databasePool(), client = await db.connect();
  const report = { at: new Date().toISOString(), schema: 'public', products: [], oldPhotosPreserved: true };
  try {
    await client.query('BEGIN');
    for (const product of manifest) {
      const result = await client.query('SELECT id, seller_id, photo_id FROM public.listings WHERE title = $1 FOR UPDATE', ['[SIM] ' + product.product]);
      if (result.rowCount !== 1) throw new Error(`Expected one matching sample listing: ${product.product}`);
      const listing = result.rows[0];
      const photoIds = [];
      for (const [position, image] of product.images.entries()) {
        const clientId = `sample-web-v1:${listing.id}:${image.sha256.slice(0, 16)}`;
        await client.query(`INSERT INTO public.listing_photos(id, seller_id, client_photo_id, mime_type, image_data)
          VALUES ($1, $2, $3, $4, $5) ON CONFLICT(seller_id, client_photo_id) DO NOTHING`, [randomUUID(), listing.seller_id, clientId, image.mimeType, image.bytes]);
        const photo = (await client.query('SELECT id FROM public.listing_photos WHERE seller_id = $1 AND client_photo_id = $2', [listing.seller_id, clientId])).rows[0];
        photoIds.push(photo.id);
        await client.query(`INSERT INTO public.listing_gallery(listing_id, photo_id, position, source_url, author, license, license_url, illustrative)
          VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) ON CONFLICT(listing_id, position)
          DO UPDATE SET photo_id = EXCLUDED.photo_id, source_url = EXCLUDED.source_url,
            author = EXCLUDED.author, license = EXCLUDED.license, license_url = EXCLUDED.license_url, illustrative = TRUE`,
        [listing.id, photo.id, position, image.sourceUrl, image.author, image.license, image.licenseUrl || '']);
      }
      await client.query('UPDATE public.listings SET photo_id = $2 WHERE id = $1', [listing.id, photoIds[0]]);
      report.products.push({ id: listing.id, title: product.product, previousCoverPhotoId: listing.photo_id, imageIds: photoIds });
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await closeDatabasePool(); }
  await writeFile('server/data/product-images/installation.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ productsUpdated: report.products.length, galleryImages: report.products.reduce((sum, item) => sum + item.imageIds.length, 0), oldPhotosPreserved: true }));
}
