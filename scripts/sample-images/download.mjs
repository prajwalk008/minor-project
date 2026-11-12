import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const directory = resolve('server/data/product-images');
await mkdir(resolve(directory, 'files'), { recursive: true });
const fromManifest = process.argv.includes('--from-manifest');
const groups = JSON.parse(await readFile(fromManifest ? 'scripts/sample-images/manifest.json' : resolve(directory, 'candidates.json'), 'utf8'));
const selection = JSON.parse(await readFile('scripts/sample-images/selection.json', 'utf8'));
const overrides = {
  'Red Carrots': [
    { url: 'https://www.johnnyseeds.com/dw/image/v2/BJGJ_PRD/on/demandware.static/-/Sites-jss-master/default/dw165cce55/images/products/vegetables/04455jp_01_rubypak.jpg?sh=800&sw=800', sourceUrl: 'https://www.johnnyseeds.com/vegetables/carrots/colored-carrots/rubypak-f1-carrot-seed-4455.html', author: "Johnny's Selected Seeds", license: 'Reference product photograph' },
    { url: 'https://tiimg.tistatic.com/fp/2/008/680/red-carrot-560.jpg', sourceUrl: 'https://www.tradeindia.com/products/red-carrot-8680560.html', author: 'Shri Shyam Enterprise / TradeIndia', license: 'Reference product photograph' }
  ],
  'Sal Wood Kitchen Serving Tray': [
    { url: 'https://i5.walmartimages.com/asr/54ec280b-4314-45b3-8215-2af04ae080cc.5c0ddbe43c7074b46c681f7979f4281e.jpeg', sourceUrl: 'https://www.walmart.ca/en/ip/relayinert-Classic-Rectangular-Wood-Serving-Tray-Tableware-Serving-Tray-Handcrafted-Decorative-Trays-Wooden-Food-Tray/32CNYCM1NW79', author: 'relayinert / Walmart Marketplace', license: 'Reference product photograph' },
    { url: 'https://img.joomcdn.net/0e50144de52ed1a67825c5dafbf44c238104395a_1024_1024.jpeg', sourceUrl: 'https://www.joom.com/de/products/61c1a5fd10c174019c9bdc9c', author: 'Joom supplier product photograph', license: 'Reference product photograph' }
  ],
  'Handcrafted Terracotta Serving Bowl': [
    { url: 'https://tiimg.tistatic.com/fp/1/009/365/clay-bowl-033.jpg', sourceUrl: 'https://www.tradeindia.com/products/clay-bowl-9365033.html', author: 'Traditions / TradeIndia', license: 'Reference product photograph' },
    { url: 'https://s.alicdn.com/%40sc04/kf/Aec207022321f429ab0451de43d7d41e3G/Clay-Made-Serving-Round-Bowl-Natural-Color-Bowl-Pakistan-Handmade-Bowl-in-Bulk-Handmade-Clay-Terracotta-Eco-Friendly-Bowls.jpg', sourceUrl: 'https://www.alibaba.com/showroom/pakistan-ceramic-bowls.html', author: 'Alibaba supplier product photograph', license: 'Reference product photograph' }
  ],
  'Red Amaranth Leaves': [
    { url: 'https://findfresh.in/attachments/shop_images/chee.jpg', sourceUrl: 'https://findfresh.in/', author: 'FindFresh', license: 'Reference product photograph' },
    { url: 'https://cpimg.tistatic.com/02921559/b/4/Red-Math.jpg', sourceUrl: 'https://www.tradeindia.com/products/red-math-c2921559.html', author: 'Swami Siddhi / TradeIndia', license: 'Reference product photograph' }
  ],
  'Handwoven Cotton Floor Duster': [
    { url: 'https://i.ebayimg.com/images/g/HQEAAOSwSkRnggd1/s-l1200.jpg', sourceUrl: 'https://www.ebay.com/itm/156666137286', author: 'IMTRA FASHION', license: 'Reference product photograph' },
    { url: 'https://i.ebayimg.com/images/g/uxEAAOSwT1xnggd1/s-l1200.jpg', sourceUrl: 'https://www.ebay.com/itm/156666137286', author: 'IMTRA FASHION', license: 'Reference product photograph' }
  ],
  'Woven Cotton Cushion Cover Pair': [
    { url: 'https://selyn.lk/cdn/shop/files/3_a5dbb981-1767-4309-8fa7-5ac11d6a737a.png?v=1742826796&width=800', sourceUrl: 'https://selyn.lk/products/plain-cushion-cover', author: 'Selyn Exporters', license: 'Reference product photograph' },
    { url: 'https://selyn.lk/cdn/shop/files/5_91fca168-a1e0-4250-8feb-886338349536.png?v=1742985080&width=800', sourceUrl: 'https://selyn.lk/products/blue-cushion-cover', author: 'Selyn Exporters', license: 'Reference product photograph' }
  ]
};
if (!fromManifest) {
const peaUrl = new URL('https://commons.wikimedia.org/w/api.php');
peaUrl.search = new URLSearchParams({ action: 'query', titles: 'File:Peas in pods - Studio.jpg', prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: '800', format: 'json' });
const peaData = await (await fetch(peaUrl, { headers: { 'User-Agent': 'MinorProjectDemo/1.0' } })).json();
const peaPage = Object.values(peaData.query?.pages || {})[0];
if (!peaPage?.imageinfo?.[0]) throw new Error('Fresh pea photograph not found');
const peaInfo = peaPage.imageinfo[0], peaMeta = peaInfo.extmetadata;
overrides['Fresh Green Peas'] = [groups.find(group => group.product === 'Fresh Green Peas').images[0], {
  title: peaPage.title, url: peaInfo.thumburl || peaInfo.url, originalUrl: peaInfo.url, sourceUrl: peaInfo.descriptionurl,
  author: String(peaMeta.Artist?.value || 'Unknown author').replace(/<[^>]*>/g, ''), license: peaMeta.LicenseShortName?.value || '', licenseUrl: peaMeta.LicenseUrl?.value || ''
}];
const holderResponse = await fetch('https://bamboomn.com/products/bamboo-utensils-holder.js');
if (!holderResponse.ok) throw new Error('Could not read utensil-holder gallery');
const holder = await holderResponse.json();
overrides['Bamboo Kitchen Utensil Holder'] = holder.images.filter(url => /utensil|utuh/i.test(url)).slice(0, 2).map(url => ({ url: (url.startsWith('//') ? 'https:' + url : url).replace(/\.(jpg|png)(\?)/i, '_800x.$1$2'), sourceUrl: 'https://bamboomn.com/products/bamboo-utensils-holder', author: 'BambooMN', license: 'Reference product photograph' }));
}
const manifest = [];
for (const group of groups) {
  const images = fromManifest ? group.images : overrides[group.product] || selection[group.product]?.map(index => group.images[index]);
  if (!images || images.length !== 2 || images.some(image => !image)) throw new Error(`Choose two images for ${group.product}`);
  const product = { product: group.product, illustrative: true, images: [] };
  for (const image of images) {
    const key = createHash('sha256').update(image.originalUrl || image.url).digest('hex').slice(0, 24);
    let bytes, mimeType, cached;
    try { cached = JSON.parse(await readFile(resolve(directory, 'files', key + '.json'), 'utf8')); bytes = await readFile(resolve(directory, 'files', key + '.bin')); mimeType = cached.mimeType; } catch {
      let response;
      for (let attempt = 0; attempt < 5; attempt++) {
        response = await fetch(image.url, { headers: { 'User-Agent': 'MinorProjectDemo/1.0 (educational demo image references)' }, signal: AbortSignal.timeout(30000) });
        if (response.status !== 429) break;
        await setTimeout(Math.min(60, Math.max(10, Number(response.headers.get('retry-after')) || 10)) * 1000);
      }
      if (!response.ok) throw new Error(`${group.product}: image download ${response.status} ${image.url}`);
      bytes = Buffer.from(await response.arrayBuffer());
      mimeType = response.headers.get('content-type')?.split(';')[0];
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) || bytes.length < 1000 || bytes.length > 4_000_000) throw new Error(`Invalid image for ${group.product}`);
      await writeFile(resolve(directory, 'files', key + '.bin'), bytes);
      await writeFile(resolve(directory, 'files', key + '.json'), JSON.stringify({ mimeType }));
      await setTimeout(1500);
    }
    product.images.push({ ...image, key, mimeType, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), cachedFile: `server/data/product-images/files/${key}.bin` });
  }
  if (product.images[0].sha256 === product.images[1].sha256) throw new Error(`Duplicate image content for ${group.product}`);
  manifest.push(product);
  await writeFile('scripts/sample-images/manifest.json', JSON.stringify(manifest, null, 2));
  console.log(`${manifest.length}/30: ${group.product} — 2 images cached`);
}
console.log(`Ready: ${manifest.length} products, ${manifest.reduce((sum, item) => sum + item.images.length, 0)} sourced images`);
