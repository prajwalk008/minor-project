import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
const output = resolve('server/data/product-images');
await mkdir(output, { recursive: true });
const queries = JSON.parse(await readFile('scripts/sample-images/queries.json', 'utf8'));
let results = [];
try { results = JSON.parse(await readFile(resolve(output, 'candidates.json'), 'utf8')); } catch { /* first run */ }
const clean = value => String(value || '').replace(/<[^>]*>/g, '').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").trim();
for (const [product, search] of queries) {
  if (results.some(result => result.product === product && result.search === search)) continue;
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: search + ' filetype:bitmap', gsrnamespace: '6', gsrlimit: '20', prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: '800', format: 'json' });
  let response;
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetch(url, { headers: { 'User-Agent': 'MinorProjectDemo/1.0 (educational product image credits)' }, signal: AbortSignal.timeout(30000) });
    if (response.status !== 429) break;
    const retry = Math.min(60, Math.max(10, Number(response.headers.get('retry-after')) || 10));
    console.log(`Commons rate limit; waiting ${retry}s before retry`);
    await setTimeout(retry * 1000);
  }
  if (!response.ok) throw new Error(`Commons search ${response.status}`);
  const data = await response.json();
  const images = Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index).flatMap(page => {
    const info = page.imageinfo?.[0], meta = info?.extmetadata;
    const license = clean(meta?.LicenseShortName?.value);
    if (!info || !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime) || info.width < 300 || info.height < 200 || !/^(CC0|Public domain|CC BY)/i.test(license)) return [];
    return [{ title: page.title, url: info.thumburl || info.url, originalUrl: info.url, sourceUrl: info.descriptionurl, author: clean(meta?.Artist?.value) || 'Unknown author', license, licenseUrl: meta?.LicenseUrl?.value || '', width: info.width, height: info.height }];
  });
  results = results.filter(result => result.product !== product);
  results.push({ product, search, images });
  console.log(JSON.stringify({ product, images: images.map((image, index) => `${index}: ${image.title}`) }));
  await writeFile(resolve(output, 'candidates.json'), JSON.stringify(results, null, 2));
  await setTimeout(3000);
}
