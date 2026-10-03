'use strict';

const axios = require('axios');
const { selectLatestVersion } = require('./version');

// ─── Caches & rate-limit backoff ──────────────────────────────────────────────

const AUTH_TTL_MS = 60 * 60 * 1000;
const TOKEN_CACHE_MAX_MS = 4 * 60 * 1000;
const TAGS_TTL_MS = 10 * 60 * 1000;
const DIGEST_TTL_MS = 2 * 60 * 1000;
const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;
const TAGS_PER_PAGE = 1000;
const MAX_TAG_PAGES = 10;

const authCache = new Map();
const tokenCache = new Map();
const tagsCache = new Map();
const digestCache = new Map();
const backoffUntil = new Map();
const inflightTokens = new Map();

function cacheGet(map, key) {
    const entry = map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
        map.delete(key);
        return undefined;
    }
    return entry.value;
}

function cacheSet(map, key, value, ttlMs) {
    map.set(key, { value, expires: Date.now() + ttlMs });
}

function isBackedOff(image) {
    const until = backoffUntil.get(image);
    if (!until) return false;
    if (Date.now() > until) {
        backoffUntil.delete(image);
        return false;
    }
    return true;
}

function noteRateLimit(image, error) {
    if (error && error.response && error.response.status === 429) {
        backoffUntil.set(image, Date.now() + RATE_LIMIT_BACKOFF_MS);
        console.warn(`Registry rate limit hit for ${image}; backing off for 5 minutes`);
        return true;
    }
    return false;
}

// ─── Registry Detection ───────────────────────────────────────────────────────

const DOCKER_HUB_HOSTS = ['docker.io', 'index.docker.io', 'registry-1.docker.io'];

function detectRegistry(image) {
    if (image.startsWith('ghcr.io/')) {
        return { type: 'ghcr', registry: 'ghcr.io', apiBase: 'https://ghcr.io/v2' };
    }

    if (image.startsWith('lscr.io/')) {
        // lscr.io is a vanity facade in front of ghcr.io.
        return { type: 'lscr', registry: 'lscr.io', apiBase: 'https://lscr.io/v2' };
    }

    const stripped = image.replace(
        /^(index\.docker\.io|registry-1\.docker\.io|docker\.io)\//,
        ''
    );
    const host = stripped.split('/')[0];
    const looksLikeHost =
        host.includes('.') || host.includes(':') || host === 'localhost';

    // Unknown third-party registries (quay.io, localhost:5000, ...) are not
    // supported yet rather than being silently queried on Docker Hub.
    if (looksLikeHost && !DOCKER_HUB_HOSTS.includes(host)) {
        return { type: 'unsupported', registry: host, apiBase: `https://${host}/v2` };
    }

    return {
        type: 'dockerhub',
        registry: 'registry-1.docker.io',
        apiBase: 'https://registry-1.docker.io/v2',
    };
}

function buildImagePath(rawImage, registryType) {
    const imagePath = rawImage.replace(
        /^(ghcr\.io|lscr\.io|docker\.io|index\.docker\.io|registry-1\.docker\.io)\//,
        ''
    );
    return registryType === 'dockerhub' && !imagePath.includes('/')
        ? `library/${imagePath}`
        : imagePath;
}

// Parse an RFC5988 Link header for the rel="next" page, resolving a relative URL
// against the registry origin. Returns null when there is no next page.
function parseNextLink(linkHeader, apiBase) {
    if (!linkHeader) return null;
    const match = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(linkHeader);
    if (!match) return null;

    const link = match[1];
    if (/^https?:\/\//i.test(link)) return link;
    try {
        return new URL(link, apiBase).toString();
    } catch {
        return null;
    }
}

// ─── Image Reference Parsing ──────────────────────────────────────────────────

// Splits "[registry[:port]/]name[:tag][@digest]" into a normalized image name
// and tag. The tag separator is the last ':' AFTER the last '/', so registry
// ports (localhost:5000/foo) are preserved.
function parseImage(imageString) {
    const withoutDigest = imageString.split('@')[0];
    const lastSlash = withoutDigest.lastIndexOf('/');
    const lastColon = withoutDigest.lastIndexOf(':');

    let imageName = withoutDigest;
    let tag = 'latest';

    if (lastColon > lastSlash) {
        imageName = withoutDigest.substring(0, lastColon);
        tag = withoutDigest.substring(lastColon + 1);
    }

    const fullImageName = imageName.includes('/') ? imageName : `library/${imageName}`;
    return { image: fullImageName, tag };
}

// ─── Auth discovery & tokens ──────────────────────────────────────────────────

function parseWwwAuthenticate(header) {
    if (!header) return null;
    const m = /^Bearer\s+(.*)$/i.exec(header.trim());
    if (!m) return null;

    const params = {};
    const re = /(\w+)="([^"]*)"/g;
    let match;
    while ((match = re.exec(m[1])) !== null) {
        params[match[1].toLowerCase()] = match[2];
    }
    return params.realm ? params : null;
}

// Ask the registry how it wants to be authenticated instead of hardcoding
// token endpoints. Returns null when anonymous access is allowed.
async function discoverAuth(registry) {
    const cached = cacheGet(authCache, registry.apiBase);
    if (cached !== undefined) return cached;

    let auth = null;
    try {
        const response = await axios.get(`${registry.apiBase}/`, {
            timeout: 5000,
            validateStatus: () => true,
        });
        if (response.status === 401) {
            auth = parseWwwAuthenticate(response.headers['www-authenticate']);
        }
    } catch (error) {
        console.error(`Auth discovery failed for ${registry.registry}:`, error.message);
    }

    cacheSet(authCache, registry.apiBase, auth, AUTH_TTL_MS);
    return auth;
}

// Returns { token, registry, repositoryPath }. `token` may be null when the
// registry allows anonymous access.
async function getRegistryToken(image) {
    const registry = detectRegistry(image);
    if (registry.type === 'unsupported') {
        return { token: null, registry, repositoryPath: null };
    }

    const repositoryPath = buildImagePath(image, registry.type);
    const key = `${registry.apiBase}|${repositoryPath}`;

    const cached = cacheGet(tokenCache, key);
    if (cached !== undefined) return { token: cached, registry, repositoryPath };

    if (inflightTokens.has(key)) {
        return { token: await inflightTokens.get(key), registry, repositoryPath };
    }

    const promise = (async () => {
        const auth = await discoverAuth(registry);
        if (!auth) return null; // anonymous access

        try {
            const response = await axios.get(auth.realm, {
                params: { service: auth.service, scope: `repository:${repositoryPath}:pull` },
                timeout: 5000,
            });
            const token = response.data.token || response.data.access_token || null;
            if (token) {
                const expiresInMs = (response.data.expires_in || 300) * 1000;
                cacheSet(tokenCache, key, token, Math.min(expiresInMs - 30000, TOKEN_CACHE_MAX_MS));
            }
            return token;
        } catch (error) {
            console.error(`Failed to get token for ${image}:`, error.message);
            return null;
        }
    })();

    inflightTokens.set(key, promise);
    try {
        return { token: await promise, registry, repositoryPath };
    } finally {
        inflightTokens.delete(key);
    }
}

// ─── Registry API ─────────────────────────────────────────────────────────────

async function getDigestForTag(apiBase, repositoryPath, tag, token, backoffKey) {
    const acceptTypes = [
        'application/vnd.oci.image.index.v1+json',
        'application/vnd.docker.distribution.manifest.list.v2+json',
        'application/vnd.docker.distribution.manifest.v2+json',
    ];

    for (const accept of acceptTypes) {
        try {
            const headers = { Accept: accept };
            if (token) headers.Authorization = `Bearer ${token}`;

            const response = await axios.head(
                `${apiBase}/${repositoryPath}/manifests/${tag}`,
                { headers, timeout: 5000 }
            );
            const digest = response.headers['docker-content-digest'];
            if (digest) return digest;
        } catch (error) {
            if (noteRateLimit(backoffKey, error)) return null;
            // Otherwise try the next manifest type.
        }
    }
    return null;
}

// Remote digest for a tag - used only for update detection (floating tags).
async function getRemoteDigest(image, tag = 'latest') {
    const registry = detectRegistry(image);
    if (registry.type === 'unsupported' || isBackedOff(image)) return null;

    const key = `digest|${image}|${tag}`;
    const cached = cacheGet(digestCache, key);
    if (cached !== undefined) return cached;

    const { token, repositoryPath } = await getRegistryToken(image);
    if (repositoryPath === null) return null;

    const digest = await getDigestForTag(
        registry.apiBase,
        repositoryPath,
        tag,
        token,
        image
    );

    if (digest) cacheSet(digestCache, key, digest, DIGEST_TTL_MS);
    return digest;
}

async function getRepositoryTags(image) {
    const registry = detectRegistry(image);
    if (registry.type === 'unsupported' || isBackedOff(image)) return null;

    const key = `tags|${image}`;
    const cached = cacheGet(tagsCache, key);
    if (cached !== undefined) return cached;

    const { token, repositoryPath } = await getRegistryToken(image);
    if (repositoryPath === null) return null;

    try {
        const headers = { Accept: 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        // Registries paginate tags/list (Docker Hub caps a page at 1000) and
        // advertise the next page via a Link: rel="next" header.
        const tags = [];
        let url = `${registry.apiBase}/${repositoryPath}/tags/list?n=${TAGS_PER_PAGE}`;
        for (let page = 0; page < MAX_TAG_PAGES && url; page++) {
            const response = await axios.get(url, { headers, timeout: 5000 });
            tags.push(...(response.data.tags || []));
            url = parseNextLink(response.headers.link, registry.apiBase);
        }

        cacheSet(tagsCache, key, tags, TAGS_TTL_MS);
        return tags;
    } catch (error) {
        if (!noteRateLimit(image, error)) {
            console.error(`Failed to get version tags for ${image}:`, error.message);
        }
        return null;
    }
}

// Newest stable tag (and the bump type) for the given current tag.
async function getLatestVersionInfo(image, currentTag) {
    const tags = await getRepositoryTags(image);
    if (!tags) return { latest: null, bump: null, newer: false };
    return selectLatestVersion(tags, currentTag, {
        checkMajor: process.env.CHECK_MAJOR === 'true',
    });
}

// Pure decision function: combines the digest check (floating tags) with the
// version check (pinned tags) into the fields the UI consumes. Images pinned by
// digest (@sha256:...) are never flagged, since the user explicitly locked them.
function evaluateUpdate({ registrySupported, currentDigest, remoteDigest, versionInfo, digestPinned = false }) {
    const digestChanged = !!(remoteDigest && currentDigest && remoteDigest !== currentDigest);
    const newer = !!(versionInfo && versionInfo.newer);
    const updateAvailable = !!(registrySupported && !digestPinned && (digestChanged || newer));
    const updateType = updateAvailable ? (newer ? versionInfo.bump : 'digest') : null;
    return { updateAvailable, updateType, digestChanged, newer };
}

module.exports = {
    detectRegistry,
    buildImagePath,
    parseImage,
    parseNextLink,
    getRegistryToken,
    getRemoteDigest,
    getRepositoryTags,
    getLatestVersionInfo,
    evaluateUpdate,
};
