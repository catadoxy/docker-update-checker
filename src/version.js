'use strict';

// Pure, dependency-free version/tag helpers. Kept separate from the registry
// and server code so they can be unit-tested without network or Docker.

// Recognised prerelease identifiers in a tag suffix (1.2.3-rc1, 1.2.3-beta.2).
const PRE_RELEASE_RE =
    /^(rc|alpha|beta|dev|nightly|pre|preview|snapshot|canary|milestone)([.\-]?\d|$)/i;

function isPreReleaseSuffix(suffix) {
    if (!suffix) return false;
    return PRE_RELEASE_RE.test(suffix);
}

// Parse a version-like tag: [v]MAJOR[.MINOR[.PATCH...]][-SUFFIX]
// Returns null when the tag is not a version (e.g. "latest", "stable").
function parseVersion(tag) {
    if (typeof tag !== 'string') return null;
    const m = /^(v)?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z][0-9A-Za-z.\-]*))?$/.exec(tag);
    if (!m) return null;

    const suffix = m[3] || null;
    const prerelease = isPreReleaseSuffix(suffix);

    return {
        raw: tag,
        prefix: m[1] || '',
        core: m[2],
        parts: m[2].split('.').map(Number),
        suffix,
        prerelease,
        // A non-prerelease suffix ("alpine", "slim") identifies a build variant.
        variant: suffix && !prerelease ? suffix.toLowerCase() : null,
    };
}

function isVersionTag(tag) {
    return parseVersion(tag) !== null;
}

// Compare numeric cores: > 0 if a is newer, < 0 if older, 0 if equal.
function compareParts(a, b) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
        const x = a[i] || 0;
        const y = b[i] || 0;
        if (x !== y) return x - y;
    }
    return 0;
}

function sortVersionsDesc(tags) {
    return [...tags].sort((a, b) => {
        const pa = parseVersion(a);
        const pb = parseVersion(b);
        if (!pa || !pb) return 0;
        return compareParts(pb.parts, pa.parts);
    });
}

// Classify the jump from `current` to `latest`: 'major' | 'minor' | 'patch' | null.
function bumpType(current, latest) {
    if (!current || !latest) return null;
    const a = current.parts;
    const b = latest.parts;
    const n = Math.max(a.length, b.length);

    for (let i = 0; i < n; i++) {
        const x = a[i] || 0;
        const y = b[i] || 0;
        if (x !== y) {
            if (y < x) return null; // latest is older than current
            return i === 0 ? 'major' : i === 1 ? 'minor' : 'patch';
        }
    }
    return null; // equal
}

// Pick the newest stable tag that is a meaningful update for `currentTag`.
// Only tags sharing the same build variant (e.g. -alpine) are considered;
// prereleases are ignored.
function selectLatestVersion(tags, currentTag) {
    const stable = tags.filter((t) => {
        const p = parseVersion(t);
        return p && !p.prerelease;
    });

    const current = parseVersion(currentTag);

    // Floating tag (latest, stable, edge...): report the newest stable version
    // for display, but let digest comparison decide if something changed.
    if (!current) {
        const sorted = sortVersionsDesc(stable);
        return { latest: sorted[0] || null, bump: null, newer: false };
    }

    const sameVariant = stable.filter((t) => {
        const p = parseVersion(t);
        return p.variant === current.variant;
    });

    const latest = sortVersionsDesc(sameVariant)[0] || null;
    if (!latest) return { latest: null, bump: null, newer: false };

    const bump = bumpType(current, parseVersion(latest));
    return { latest, bump, newer: bump !== null };
}

module.exports = {
    isPreReleaseSuffix,
    parseVersion,
    isVersionTag,
    compareParts,
    sortVersionsDesc,
    bumpType,
    selectLatestVersion,
};
