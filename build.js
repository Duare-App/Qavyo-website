#!/usr/bin/env node
/**
 * Qavyo site builder.
 *
 * Takes raw saved HTML from raw/<file>.html, and produces a rebranded,
 * fully-local page at ./<file>.html.
 *
 * Steps per page:
 *   1. Download every remote asset it references into Qavyo-images/ and
 *      rewrite the reference to the local copy.
 *   2. Rewrite internal /uk/... links to the local page that covers them
 *      (per pages.json); anything unmapped becomes "#".
 *   3. Rebrand "Epos Now" -> "Qavyo".
 *
 * Usage:
 *   node build.js                 # build every raw page that has content
 *   node build.js retail-pos      # build one page
 *   node build.js --no-download   # skip asset fetching (offline / fast pass)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const RAW_DIR = path.join(ROOT, 'raw');
const IMG_DIR = path.join(ROOT, 'Qavyo-images');
const PAGES = JSON.parse(fs.readFileSync(path.join(ROOT, 'pages.json'), 'utf-8'));

const ORIGIN = 'https://www.eposnow.com';
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|mp4|webm|js|css)$/i;

// The CDN 403s any request without a browser User-Agent. No Accept header —
// sending one makes it content-negotiate to webp, which no longer matches the
// filename extension we save under.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CONCURRENCY = 8;

// With just a domain, every eposnow.com/eposnowhq.com email keeps its local
// part and moves to that domain: info@eposnow.com -> info@qavyo.com. Set
// `emails` only for inboxes that should map to something other than their
// existing local part, e.g. { 'data.requests@eposnow.com': 'privacy@qavyo.com' }
// — those override the automatic mapping.
const BRAND = {
    domain: 'www.qavyo.com',
    emails: null
};

// The Qavyo mark replaces both original logo files. It is built by make_logo.py
// at the same 3.81:1 ratio as the artwork it stands in for, so it drops into the
// existing header, footer and placeholder styling untouched. Its red reads on
// the light header and on the dark navy panels alike, so one file covers the
// "navy" and "white" variants the theme expects.
// The favicons are generated from the Q on its own, since they have to be
// square. safari-pinned-tab.svg is left alone: it is a monochrome vector mask
// that cannot be produced from the supplied PNG.
const LOGO_REPLACES = {
    'logo-navy.svg': 'qavyo-logo.png',
    'logo-white.svg': 'qavyo-logo.png',
    'favicon-16x16.png': 'qavyo-favicon-16.png',
    'favicon-32x32.png': 'qavyo-favicon-32.png',
    'apple-touch-icon.png': 'qavyo-touch-icon.png'
};

function applyLogo(text) {
    for (const [original, replacement] of Object.entries(LOGO_REPLACES)) {
        // A plain substring replace also matches inside a longer filename that
        // merely ends the same way — techradar-logo-white.svg contains
        // logo-white.svg — and corrupts it into a name nothing downloaded. Only
        // replace where `original` is the whole basename: preceded by "/" or the
        // very start, followed by a path/quote/paren boundary or the string end.
        const esc = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(new RegExp(`(^|/)${esc}(?=["')\\s?#]|$)`, 'g'),
            (m, before) => before + replacement);
    }
    return text;
}

const args = process.argv.slice(2);
const DOWNLOAD = !args.includes('--no-download');
const only = args.filter(a => !a.startsWith('--'));

// ---------------------------------------------------------------- link map

// "/uk/systems/retail-pos/" -> "retail-pos.html"
//
// A page is reachable under more than one URL: the footer links the Terms page
// as /uk/contact-us/about/terms-website/ while the sitemap calls it /uk/terms/.
// Every URL a page answers to has to be in here, or links using the other form
// silently fall back to "#" and the page ends up orphaned.
// Only pages that have source pasted into raw/ go in. An entry in pages.json is
// a declaration of intent; until the page actually exists, links to it have to
// keep falling back to "#" rather than pointing at a file that 404s.
function hasSource(file) {
    const p = path.join(RAW_DIR, file);
    return fs.existsSync(p) && fs.statSync(p).size > 2000;
}

const linkMap = new Map();
const pending = [];
for (const p of PAGES) {
    if (!hasSource(p.file)) { pending.push(p); continue; }
    for (const url of [p.src, ...(p.aliases || [])]) {
        linkMap.set(normalisePath(url), p.file);
    }
}

// "terms" -> "terms.html", for the extensionless relative links in the markup.
const slugMap = new Map(PAGES.map(p => [p.file.replace(/\.html$/, ''), p.file]));

function normalisePath(href) {
    let h = href.split('#')[0].split('?')[0];
    if (h.startsWith(ORIGIN)) h = h.slice(ORIGIN.length);
    if (!h.startsWith('/')) return null;
    if (!h.endsWith('/')) h += '/';
    return h;
}

// ------------------------------------------------------------- asset cache

if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

const localAssets = new Set(fs.readdirSync(IMG_DIR));
const failed = new Set();

// url -> local filename, persisted so that a name assigned once keeps pointing
// at the same remote file on every later build. Without it, two assets sharing
// a basename would be resolved in whatever order the downloads happened to
// finish, which is not stable between runs.
const MANIFEST = path.join(IMG_DIR, 'assets.manifest.json');
const downloaded = new Map(
    fs.existsSync(MANIFEST)
        ? Object.entries(JSON.parse(fs.readFileSync(MANIFEST, 'utf-8')))
        : []
);
// filename -> the url that owns it, so a second url wanting the same basename
// can be spotted rather than silently overwriting the first one's file.
const claimedBy = new Map([...downloaded].map(([url, name]) => [name, url]));
// Downloads in progress, so concurrent requests for one url share a single
// fetch instead of racing to write the same file.
const inFlight = new Map();
const collisions = [];

function saveManifest() {
    const sorted = Object.fromEntries([...downloaded].sort((a, b) => a[0].localeCompare(b[0])));
    fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2), 'utf-8');
}

function absolute(url) {
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('http')) return url;
    return ORIGIN + (url.startsWith('/') ? url : '/' + url);
}

function assetFilename(url) {
    let base = decodeURIComponent(url.split('?')[0].split('#')[0].split('/').pop());
    base = base.replace(/[<>:"|*\\]/g, '_');
    if (!base) return null;
    return base;
}

// Assets from different directories can share a basename. Where the bytes match
// they can share one file; where they differ, the newcomer gets a name suffixed
// with a hash of its own url, which is stable across runs.
function disambiguate(name, url) {
    const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 8);
    const dot = name.lastIndexOf('.');
    return `${name.slice(0, dot)}-${hash}${name.slice(dot)}`;
}

// The pages reference one asset under several urls that differ only by the
// ?m=<timestamp> cache-buster. Those are the same file, so identity ignores the
// query — otherwise each variant looks like a separate asset competing for the
// same filename.
function assetKey(url) {
    return absolute(url).split('?')[0];
}

async function fetchAsset(rawUrl) {
    const url = assetKey(rawUrl);
    if (downloaded.has(url)) return downloaded.get(url);
    if (failed.has(url)) return null;
    if (inFlight.has(url)) return inFlight.get(url);

    const promise = fetchAssetOnce(url);
    inFlight.set(url, promise);
    try {
        return await promise;
    } finally {
        inFlight.delete(url);
    }
}

async function fetchAssetOnce(url) {
    let name = assetFilename(url);
    if (!name || !ASSET_EXT.test(name)) return null;

    const owner = claimedBy.get(name);
    const alreadyOnDisk = localAssets.has(name) && (owner === undefined || owner === url);
    if (alreadyOnDisk) {
        claimedBy.set(name, url);
        downloaded.set(url, name);
        return name;
    }
    if (!DOWNLOAD) return null;

    try {
        const abs = absolute(url);
        const res = await fetch(abs, { headers: { 'User-Agent': UA } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());

        if (owner !== undefined && owner !== url) {
            // Identical bytes are not a real clash — let both urls share the file.
            const existing = fs.readFileSync(path.join(IMG_DIR, name));
            if (!existing.equals(buf)) {
                const renamed = disambiguate(name, url);
                collisions.push({ name, kept: owner, renamedTo: renamed, url });
                name = renamed;
            } else {
                downloaded.set(url, name);
                return name;
            }
        }

        fs.writeFileSync(path.join(IMG_DIR, name), buf);
        localAssets.add(name);
        claimedBy.set(name, url);
        downloaded.set(url, name);
        if (name.endsWith('.css')) await localiseStylesheet(name, abs);
        if (name.endsWith('.js')) await localiseScript(name);
        return name;
    } catch (err) {
        failed.add(url);
        process.stdout.write(`    ! ${url} (${err.message})\n`);
        return null;
    }
}

const TRANSPARENT_PIXEL =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// A downloaded stylesheet lands flat in Qavyo-images/, so its own relative
// url(../images/x.svg) references no longer resolve. Pull each referenced file
// down alongside it and flatten the reference to a bare filename.
async function localiseStylesheet(name, sheetUrl) {
    const file = path.join(IMG_DIR, name);
    let css = fs.readFileSync(file, 'utf-8');

    const refs = new Set();
    for (const m of css.matchAll(URL_CSS)) {
        const raw = m[2].trim();
        if (!raw || raw.startsWith('data:') || raw.startsWith('#')) continue;
        refs.add(raw);
    }

    const map = new Map();
    await pool([...refs], async raw => {
        // Strip the IE ?#iefix / #FontName suffixes before resolving.
        const clean = raw.split('#')[0];
        if (!ASSET_EXT.test(clean.split('?')[0])) return;
        const resolved = new URL(clean, sheetUrl).href;
        let local = await fetchAsset(resolved);
        // Some third-party sheets reference a path that 404s (they were bundled
        // from a different directory layout). If another sheet already pulled a
        // file of that name, reuse it rather than leaving a broken reference.
        if (!local) {
            const bare = assetFilename(clean);
            if (bare && localAssets.has(bare)) local = bare;
        }
        if (local) map.set(raw, local);
    });

    css = css.replace(URL_CSS, (m, a, url, c) => {
        const raw = url.trim();
        if (raw.startsWith('data:') || /^https?:|^\/\//.test(raw)) return m;
        const local = map.get(raw);
        if (local) {
            const frag = raw.includes('#') ? '#' + raw.split('#').slice(1).join('#') : '';
            return a + local + frag + c;
        }
        // Unresolvable — the origin 404s it. Leaving the relative path in would
        // point at a directory that does not exist locally, so substitute a
        // transparent pixel: same rendering as a broken image, minus the 404.
        return a + TRANSPARENT_PIXEL + c;
    });

    // Runs for every stylesheet, including ones with no url() references at all
    // — a sheet can still name a logo file somewhere the rewriting never looks.
    fs.writeFileSync(file, applyLogo(css), 'utf-8');
}

// The bundles lazy-load further scripts, building the URL at runtime from a
// base-path variable: `"".concat(Ot, "/js/forms.js")`, where Ot holds the theme
// directory. Nothing in the HTML mentions those files, so they have to be found
// here — otherwise carousels, form handling and the phone input silently 404.
const JS_LAZY_PATH = /""\.concat\((\w+),"(\/[^"]+)"\)/g;

// form-secure.js is a bot-detection service keyed to Epos Now's account, and
// app.js loads it on any page carrying a form. Point its endpoints at a local
// path that does not exist, so it fails harmlessly instead of reporting our
// visitors' form interactions to them.
function neutraliseJsEndpoints(js) {
    return js.replace(/https?:\/\/(?:[a-z0-9-]+\.)*eposnow(?:hq)?\.com[^"'\s)]*/gi,
        '/disabled-endpoint');
}

async function localiseScript(name) {
    const file = path.join(IMG_DIR, name);
    let js = fs.readFileSync(file, 'utf-8');

    const refs = new Map(); // full expression -> remote url
    for (const m of js.matchAll(JS_LAZY_PATH)) {
        const [expr, varName, tail] = m;
        if (!ASSET_EXT.test(tail)) continue;
        const varDef = js.match(new RegExp(`\\b${varName}\\s*=\\s*"([^"]+)"`));
        if (!varDef) continue;
        refs.set(expr, absolute(varDef[1] + tail));
    }
    if (refs.size) {
        const map = new Map();
        await pool([...refs], async ([expr, url]) => {
            const local = await fetchAsset(url);
            if (local) map.set(expr, local);
        });
        js = js.replace(JS_LAZY_PATH, expr =>
            map.has(expr) ? JSON.stringify('Qavyo-images/' + map.get(expr)) : expr);
    }

    // Runs for every script, including ones with no lazy paths at all.
    js = neutraliseJsEndpoints(js);
    fs.writeFileSync(file, js, 'utf-8');
}

// Run `worker` over `items` with at most CONCURRENCY in flight.
async function pool(items, worker) {
    let i = 0;
    const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
        while (i < items.length) await worker(items[i++]);
    });
    await Promise.all(runners);
}

// ------------------------------------------------------------ url rewriting

// Every src="", href="", srcset="", and url() target in the document.
// data-js-visible holds a script URL that app.js loads when the element scrolls
// into view, so it needs localising like any other asset reference.
const URL_ATTR = /(\b(?:src|href|poster|data-src|data-js-visible|content)\s*=\s*")([^"]+)(")/gi;
const URL_CSS = /(url\(\s*['"]?)([^'")]+)(['"]?\s*\))/gi;
const SRCSET = /(\bsrcset\s*=\s*")([^"]+)(")/gi;

function collectUrls(html) {
    const urls = new Set();
    const add = u => {
        u = u.trim();
        if (!u || u.startsWith('data:') || u.startsWith('#') || u.startsWith('tel:') || u.startsWith('mailto:')) return;
        if (u.startsWith('Qavyo-images/')) return; // already local
        if (u.startsWith('//')) u = 'https:' + u;
        if (u.startsWith('http') && !/eposnow\.com/.test(u)) return; // 3rd-party, leave alone
        if (!ASSET_EXT.test(u.split('?')[0])) return;
        urls.add(u);
    };
    for (const m of html.matchAll(URL_ATTR)) add(m[2]);
    for (const m of html.matchAll(URL_CSS)) add(m[2]);
    for (const m of html.matchAll(SRCSET)) {
        for (const part of m[2].split(',')) add(part.trim().split(/\s+/)[0]);
    }
    return [...urls];
}

function replaceUrl(raw, map) {
    let u = raw.trim();
    if (u.startsWith('//')) u = 'https:' + u;
    const local = map.get(u);
    return local ? 'Qavyo-images/' + local : raw;
}

async function localiseAssets(html) {
    const urls = collectUrls(html);
    const map = new Map();
    let done = 0;
    await pool(urls, async u => {
        const local = await fetchAsset(u);
        if (local) map.set(u, local);
        if (++done % 25 === 0 || done === urls.length) {
            process.stdout.write(`\r    assets ${done}/${urls.length}`);
        }
    });
    if (urls.length) process.stdout.write('\n');
    if (!map.size) return html;

    html = html.replace(URL_ATTR, (m, a, url, c) => a + replaceUrl(url, map) + c);
    html = html.replace(URL_CSS, (m, a, url, c) => a + replaceUrl(url, map) + c);
    html = html.replace(SRCSET, (m, a, set, c) => {
        const out = set.split(',').map(part => {
            const [url, ...rest] = part.trim().split(/\s+/);
            return [replaceUrl(url, map), ...rest].join(' ');
        }).join(', ');
        return a + out + c;
    });
    return html;
}

// ----------------------------------------------------------- link localising

function localiseLinks(html) {
    const unmapped = new Set();
    html = html.replace(/(\bhref\s*=\s*")([^"]+)(")/gi, (m, a, href, c) => {
        const h = href.trim();
        if (h.startsWith('#') || h.startsWith('tel:') || h.startsWith('mailto:')) return m;
        if (h.startsWith('Qavyo-images/')) return m;
        if (h.endsWith('.html')) return m;

        // Bare relative slugs, no leading slash and no extension. The consent
        // text under every form links "terms" and "privacy-policy" this way,
        // which the original site resolved against its own routing; locally they
        // point at files that do not exist.
        if (slugMap.has(h)) return a + slugMap.get(h) + c;

        const norm = normalisePath(h);
        if (!norm) {
            // Absolute link somewhere else. Anything still pointing at an Epos
            // Now property — other locales, their support portal, socials,
            // Trustpilot — would send visitors off this site to theirs, so
            // neutralise it. Genuinely unrelated third parties are left alone.
            return /epos[-_ ]?now/i.test(h) ? a + '#' + c : m;
        }
        // Only the UK locale is being rebuilt, so /au/, /us/ etc. have no local
        // equivalent and would 404.
        if (!norm.startsWith('/uk/')) return a + '#' + c;

        const target = linkMap.get(norm);
        if (target) return a + target + c;

        unmapped.add(norm);
        return a + '#' + c;
    });

    // The country switcher navigates to <option value="https://...">, so those
    // targets need neutralising as well — they are not href attributes.
    html = html.replace(/(\bvalue\s*=\s*")(https?:\/\/[^"]*eposnow[^"]*)(")/gi,
        (m, a, url, c) => a + '#' + c);

    // Absolute URLs also appear outside link attributes: og:url, JSON-LD
    // "url" fields, and plain prose in the legal pages. Sweep whatever is left.
    html = html.replace(/https?:\/\/(?:[a-z0-9-]+\.)*eposnow(?:hq)?\.com[^\s"'<>)]*/gi, url => {
        const norm = normalisePath(url.replace(/[.,]$/, ''));
        if (norm && norm.startsWith('/uk/')) {
            const target = linkMap.get(norm);
            if (target) return target;
            unmapped.add(norm);
        }
        return '#';
    });

    // Credits their marketing account rather than ours.
    html = html.replace(/<meta[^>]+name="twitter:creator"[^>]*>/gi, '');

    return { html, unmapped };
}

// ------------------------------------------------------------------ rebrand

function rebrand(html) {
    // Local asset paths must survive verbatim: some downloaded filenames carry
    // the old brand name, and rebranding the reference would point it at a file
    // that does not exist on disk. Mask the paths, rebrand the prose, restore.
    const masked = [];
    html = html.replace(/Qavyo-images\/[^"'?)#\s]*/g, m => {
        masked.push(m);
        return `\0${masked.length - 1}\0`;
    });

    // Covers "Epos Now", "EPOS Now", "EPOS NOW", "Eposnow", etc. The leading E
    // must be capital: that is what keeps the lowercase "eposnow.com" hostname
    // out of scope. Bare "EPOS" is left alone — in the UK it is a generic term
    // for electronic point of sale, not the brand.
    html = html.replace(/E(?:POS|pos)\s?(?:NOW|Now|now)/g,
        m => (m === m.toUpperCase() ? 'QAVYO' : 'Qavyo'));

    // Lowercase prose ("...services from epos now"). The space is required so
    // this cannot touch a bare "eposnow" hostname.
    html = html.replace(/epos now/g, 'Qavyo');

    return html.replace(/\0(\d+)\0/g, (m, i) => masked[i]);
}

// Applies BRAND if it has been filled in, and reports whatever contact details
// are still pointing at the original company.
function applyBrandContacts(html, leftovers) {
    const bareDomain = BRAND.domain ? BRAND.domain.replace(/^www\./i, '') : null;

    // Explicit overrides run first, so they win over the automatic mapping below.
    if (BRAND.emails) {
        for (const [from, to] of Object.entries(BRAND.emails)) {
            html = html.split(from).join(to);
        }
    }

    // Everything else keeps its local part and moves to our domain:
    // info@eposnow.com -> info@qavyo.com. Emails never carry "www.", regardless
    // of whether BRAND.domain has it.
    if (bareDomain) {
        html = html.replace(/([\w.+-]+)@(?:www\.)?eposnow(?:hq)?\.com/gi,
            (m, local) => `${local}@${bareDomain}`);
    }

    // Plain-text/URL mentions outside of an email — preserve whether the
    // original had "www." so www.eposnow.com/... links keep resolving as a URL.
    if (BRAND.domain) {
        html = html.replace(/(www\.)?eposnow(?:hq)?\.com/gi,
            (m, www) => (www ? 'www.' : '') + bareDomain);
    }

    for (const m of html.matchAll(/[\w.+-]+@[\w.-]*eposnow[\w.-]*\.com/gi)) leftovers.add(m[0]);
    for (const m of html.matchAll(/(?:www\.)?eposnow(?:hq)?\.com[^\s"'<>)]*/gi)) leftovers.add(m[0]);
    return html;
}

// The pages ship Epos Now's Google Tag Manager container. Leaving it in would
// send our page views to their analytics, so strip the loader and its noscript
// iframe fallback.
function stripTracking(html) {
    return html
        .replace(/<noscript>\s*<iframe[^>]*(?:googletagmanager|moo\.eposnow)[^>]*>\s*<\/iframe>\s*<\/noscript>/gi, '')
        // The loader is minified, so the marker sits deep inside the block —
        // match whole <script> blocks and test their contents.
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, block =>
            /GTM-[A-Z0-9]+|sst\.eposnow|moo\.eposnow|googletagmanager|cloudflareinsights/i.test(block) ? '' : block)
        .replace(/<link[^>]+(?:sst|moo)\.eposnow[^>]*>/gi, '')
        // app.js loads scripts named by <meta name="requirements:register"> and
        // by data-js-visible attributes. Where those point at LeadGen, they are
        // form scripts keyed to Epos Now's account — leaving them in would post
        // our visitors' submissions into their lead system.
        .replace(/<meta[^>]+name="requirements:register"[^>]*>\s*/gi, '')
        .replace(/\s*\bdata-js-visible="[^"]*leadgenapp[^"]*"/gi, '');
}

// Runs after the links have been rewritten.
function cleanup(html) {
    return html
        // Upstream markup bug: some phone links are written as
        // href="https://tel:0800%20294 5945", which no dialler can handle.
        .replace(/href="https?:\/\/tel:([^"]*)"/gi, (m, num) =>
            `href="tel:${num.replace(/%20|\s/g, '')}"`)
        // A preconnect whose target was just neutralised has nothing to do.
        .replace(/<link[^>]+rel="(?:preconnect|dns-prefetch)"[^>]*>\s*/gi, m =>
            /href="#"/.test(m) ? '' : m);
}

// ------------------------------------------------------------------- verify

// The build reports what it failed to download, but that says nothing about
// whether the pages it just wrote actually resolve. This re-reads the output and
// checks every local reference in it, so a broken build cannot pass quietly.
function verify(builtFiles) {
    const problems = [];
    const orphans = [];
    const seen = new Set();

    const checkRef = (ref, source) => {
        const key = ref + '|' + source;
        if (seen.has(key)) return;
        seen.add(key);
        if (!fs.existsSync(path.join(ROOT, ref))) {
            problems.push(`${source}: references ${ref}, which does not exist`);
        }
    };

    for (const file of builtFiles) {
        const html = fs.readFileSync(path.join(ROOT, file), 'utf-8');
        for (const m of html.matchAll(/Qavyo-images\/[^"'?)#\s>]+/g)) checkRef(m[0], file);
        for (const m of html.matchAll(/(?:href|src)="([a-z0-9._-]+\.html)"/gi)) checkRef(m[1], file);
    }

    // Stylesheets sit in Qavyo-images/, so their references are relative to it.
    for (const sheet of fs.readdirSync(IMG_DIR).filter(f => f.endsWith('.css'))) {
        const css = fs.readFileSync(path.join(IMG_DIR, sheet), 'utf-8');
        for (const m of css.matchAll(URL_CSS)) {
            const ref = m[2].trim().split('#')[0].split('?')[0];
            if (!ref || ref.startsWith('data:') || /^https?:|^\/\//.test(ref)) continue;
            checkRef('Qavyo-images/' + ref, 'Qavyo-images/' + sheet);
        }
    }

    // A page no other page links to is worth surfacing — that is how the Terms
    // page sat built but unreachable. It is not automatically a fault though:
    // some pages genuinely are not in the site's navigation.
    const inbound = new Map(builtFiles.map(f => [f, 0]));
    for (const file of builtFiles) {
        const html = fs.readFileSync(path.join(ROOT, file), 'utf-8');
        for (const m of html.matchAll(/href="([a-z0-9._-]+\.html)"/gi)) {
            if (m[1] !== file && inbound.has(m[1])) inbound.set(m[1], inbound.get(m[1]) + 1);
        }
    }
    for (const [file, count] of inbound) {
        if (count === 0 && file !== 'index.html') orphans.push(file);
    }

    return { problems, orphans };
}

// --------------------------------------------------------------------- main

(async () => {
    if (!fs.existsSync(RAW_DIR)) {
        console.error('raw/ folder missing. Create it and drop saved page HTML inside.');
        process.exit(1);
    }

    const targets = PAGES.filter(p => {
        if (only.length && !only.includes(p.file.replace('.html', ''))) return false;
        return hasSource(p.file); // skip empty placeholders
    });

    if (!targets.length) {
        console.log('Nothing to build. Paste page source into raw/<file>.html first.');
        return;
    }

    if (!DOWNLOAD && localAssets.size < 50) {
        console.log('WARNING: --no-download with an almost empty Qavyo-images/. ' +
                    'The pages will be written with references that do not resolve.\n');
    }

    const allUnmapped = new Set();
    const contactLeftovers = new Set();

    for (const page of targets) {
        console.log(`\n> ${page.name}  (raw/${page.file})`);
        let html = fs.readFileSync(path.join(RAW_DIR, page.file), 'utf-8');

        // stripTracking must run before localiseLinks: it identifies the
        // tracking markup by the URLs inside it, and localiseLinks rewrites
        // those URLs away.
        html = stripTracking(await localiseAssets(html));
        const linked = localiseLinks(html);
        html = applyLogo(rebrand(cleanup(linked.html)));
        html = applyBrandContacts(html, contactLeftovers);
        html = html.replace(/<!--\s*(?:PASTE HERE:|[^>]*-> builds to )[\s\S]*?-->\s*/g, '');
        linked.unmapped.forEach(u => allUnmapped.add(u));

        fs.writeFileSync(path.join(ROOT, page.file), html, 'utf-8');
        console.log(`  built -> ${page.file}  (${(html.length / 1024).toFixed(0)} KB)`);
    }

    saveManifest();

    if (collisions.length) {
        console.log('\nAssets sharing a filename with different contents.');
        console.log('Each was given a distinct name; nothing was overwritten:');
        for (const c of collisions) {
            console.log(`  ${c.name}`);
            console.log(`    kept by  ${c.kept}`);
            console.log(`    saved as ${c.renamedTo}  <- ${c.url}`);
        }
    }

    if (pending.length) {
        console.log(`\n${pending.length} page(s) declared in pages.json but not pasted yet.`);
        console.log('Links to them stay "#" until raw/<file> has the page source:');
        pending.forEach(p => console.log(`  raw/${p.file.padEnd(30)} ${p.src}`));
    }

    if (allUnmapped.size) {
        console.log('\nLinks pointing at pages not in pages.json at all (set to "#"):');
        [...allUnmapped].sort().forEach(u => console.log('  ' + u));
    }
    if (contactLeftovers.size) {
        console.log('\nContact details still naming the original company.');
        console.log('Fill in BRAND at the top of build.js and rebuild to replace them:');
        [...contactLeftovers].sort().forEach(u => console.log('  ' + u));
    }
    if (failed.size) {
        console.log(`\n${failed.size} asset(s) failed to download — see "!" lines above.`);
    }

    const { problems, orphans } = verify(targets.map(p => p.file));

    if (orphans.length) {
        console.log('\nBuilt, but no other page links to them. Fine if they are ' +
                    'not meant to be in the navigation; otherwise check the URL ' +
                    'in pages.json:');
        orphans.forEach(f => console.log('  ' + f));
    }

    if (problems.length) {
        console.log(`\nVERIFY FAILED — ${problems.length} problem(s):`);
        problems.forEach(p => console.log('  ' + p));
        if (!DOWNLOAD) {
            console.log('\nThis run used --no-download. Re-run without it before ' +
                        'treating these as real.');
        }
        process.exitCode = 1;
    } else {
        console.log('\nVerify passed: every local asset and page link resolves.');
    }
})();
