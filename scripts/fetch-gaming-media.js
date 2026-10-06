/**
 * Downloads royalty-free gaming / tech stock photos into uploads/.
 * Run: node scripts/fetch-gaming-media.js
 *
 * Sources: Pexels (https://www.pexels.com/license/) — free for commercial/demo use.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, '..', 'uploads');

/** @param {number} id Pexels photo id */
const pexels = (id, w = 900) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

const SOURCES = {
  heroSetup: pexels(442576, 1600),
  heroSetupMobile: pexels(442576, 900),
  switchConsole: pexels(371924, 900),
  gamingDesk: pexels(1174746, 900),
  gameDiscs: pexels(1174746, 900),
  controller: pexels(371924, 900),
  retro: pexels(3165335, 900),
  headset: pexels(3394650, 900),
  tablet: pexels(1334597, 900),
  phone: pexels(1092644, 900),
  delivery: pexels(4483610, 800),
  tradeIn: pexels(4483610, 800),
  warranty: pexels(442576, 800),
};

/** @type {{ url: string; dest: string }[]} */
const MANIFEST = [
  { url: SOURCES.gamingDesk, dest: 'categories/consoles.jpg' },
  { url: SOURCES.gameDiscs, dest: 'categories/games.jpg' },
  { url: SOURCES.tablet, dest: 'categories/tablet.jpg' },
  { url: SOURCES.headset, dest: 'categories/accessories.jpg' },
  { url: SOURCES.switchConsole, dest: 'categories/nintendo-switch.jpg' },
  { url: SOURCES.switchConsole, dest: 'categories/switch-consoles.jpg' },
  { url: SOURCES.gameDiscs, dest: 'categories/switch-games.jpg' },
  { url: SOURCES.controller, dest: 'categories/switch-accessories.jpg' },
  { url: SOURCES.gamingDesk, dest: 'categories/playstation.jpg' },
  { url: SOURCES.gamingDesk, dest: 'categories/ps5-consoles.jpg' },
  { url: SOURCES.gameDiscs, dest: 'categories/ps5-games.jpg' },
  { url: SOURCES.gameDiscs, dest: 'categories/ps4-games.jpg' },
  { url: SOURCES.controller, dest: 'categories/xbox.jpg' },
  { url: SOURCES.controller, dest: 'categories/xbox-consoles.jpg' },
  { url: SOURCES.gameDiscs, dest: 'categories/xbox-series-games.jpg' },
  { url: SOURCES.controller, dest: 'categories/nintendo-wii.jpg' },
  { url: SOURCES.retro, dest: 'categories/retro.jpg' },
  { url: SOURCES.tablet, dest: 'categories/ipad-tablets.jpg' },
  { url: SOURCES.phone, dest: 'categories/mobile-phones.jpg' },

  { url: SOURCES.heroSetup, dest: 'banners/upgrade-your-setup.jpg' },
  { url: SOURCES.heroSetupMobile, dest: 'banners/upgrade-your-setup-mobile.jpg' },
  { url: SOURCES.tablet, dest: 'banners/shop-ipads.jpg' },
  { url: SOURCES.tablet, dest: 'banners/shop-ipads-mobile.jpg' },
  { url: SOURCES.switchConsole, dest: 'banners/switch-2-has-landed.jpg' },
  { url: SOURCES.switchConsole, dest: 'banners/switch-2-has-landed-mobile.jpg' },
  { url: SOURCES.retro, dest: 'banners/retro-classics.jpg' },
  { url: SOURCES.retro, dest: 'banners/retro-classics-mobile.jpg' },
  { url: SOURCES.warranty, dest: 'banners/rated-great.jpg' },
  { url: SOURCES.delivery, dest: 'banners/free-delivery-over-50.jpg' },
  { url: SOURCES.tradeIn, dest: 'banners/trade-in-for-cash.jpg' },
  { url: SOURCES.warranty, dest: 'banners/warranty-included.jpg' },

  { url: SOURCES.switchConsole, dest: 'products/switch-2-console-256gb-black-joy-con-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/metroid-dread-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/mario-kart-8-deluxe-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/the-legend-of-zelda-breath-of-the-wild-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/super-smash-bros-ultimate-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/animal-crossing-new-horizons-front.jpg' },
  { url: SOURCES.controller, dest: 'products/joy-con-pair-neon-red-and-blue-front.jpg' },
  { url: SOURCES.gamingDesk, dest: 'products/playstation-5-slim-digital-edition-front.jpg' },
  { url: SOURCES.gamingDesk, dest: 'products/playstation-5-ultra-hd-blu-ray-disc-drive-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/marvels-spider-man-2-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/god-of-war-ragnarok-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/gran-turismo-7-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/the-last-of-us-part-ii-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/red-dead-redemption-2-front.jpg' },
  { url: SOURCES.controller, dest: 'products/xbox-series-x-1tb-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/forza-horizon-5-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/halo-infinite-front.jpg' },
  { url: SOURCES.controller, dest: 'products/wii-console-white-no-game-discounted-front.jpg' },
  { url: SOURCES.controller, dest: 'products/wii-remote-official-white-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/wii-sports-resort-front.jpg' },
  { url: SOURCES.gameDiscs, dest: 'products/mario-kart-wii-front.jpg' },
  { url: SOURCES.retro, dest: 'products/super-nintendo-console-boxed-front.jpg' },
  { url: SOURCES.retro, dest: 'products/super-mario-world-cartridge-only-front.jpg' },
  { url: SOURCES.retro, dest: 'products/sonic-the-hedgehog-2-mega-drive-front.jpg' },
  { url: SOURCES.retro, dest: 'products/game-boy-color-berry-front.jpg' },
  { url: SOURCES.retro, dest: 'products/pokemon-red-cartridge-only-front.jpg' },
  { url: SOURCES.phone, dest: 'products/iphone-15-128gb-unlocked-front.jpg' },
  { url: SOURCES.phone, dest: 'products/samsung-galaxy-s23-256gb-front.jpg' },
  { url: SOURCES.tablet, dest: 'products/ipad-air-5th-gen-64gb-wifi-front.jpg' },
  { url: SOURCES.tablet, dest: 'products/ipad-9th-gen-64gb-space-grey-front.jpg' },
];

const download = async (url) => {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'RespawnStoreDemo/1.0 (local asset fetch)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

const main = async () => {
  const unique = new Map();
  for (const entry of MANIFEST) {
    if (!unique.has(entry.dest)) unique.set(entry.dest, entry.url);
  }

  let ok = 0;
  let fail = 0;
  const cache = new Map();

  for (const [dest, url] of unique.entries()) {
    const absolute = path.join(uploadsRoot, dest);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });

    try {
      let buffer = cache.get(url);
      if (!buffer) {
        buffer = await download(url);
        cache.set(url, buffer);
      }
      fs.writeFileSync(absolute, buffer);
      ok += 1;
      console.log(`✓ ${dest}`);
    } catch (error) {
      fail += 1;
      console.error(`✗ ${dest}: ${error.message}`);
    }
  }

  const readme = `# Gaming media (stock photos)

Run \`node scripts/fetch-gaming-media.js\` to refresh.

## Paths (use in Admin)
| Use | Example URL |
|-----|-------------|
| Home categories | \`/uploads/categories/consoles.jpg\` … \`accessories.jpg\` |
| Banners | \`/uploads/banners/upgrade-your-setup.jpg\` |
| Products | \`/uploads/products/<slug>-front.jpg\` |

Existing \`.svg\` placeholders from seed are kept; assign JPG paths in Admin to switch.

## License
Photos from [Pexels](https://www.pexels.com/license/) — free for commercial use.

Last run: ${ok} saved, ${fail} failed.
`;

  fs.writeFileSync(path.join(uploadsRoot, 'MEDIA-README.md'), readme, 'utf8');
  console.log(`\nDone: ${ok} saved, ${fail} failed → ${uploadsRoot}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
