'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    detectRegistry,
    buildImagePath,
    parseImage,
    parseNextLink,
    evaluateUpdate,
} = require('../src/registry');

test('detectRegistry maps known hosts to their registry type', () => {
    assert.equal(detectRegistry('nginx').type, 'dockerhub');
    assert.equal(detectRegistry('library/nginx').type, 'dockerhub');
    assert.equal(detectRegistry('user/app').type, 'dockerhub');
    assert.equal(detectRegistry('docker.io/user/app').type, 'dockerhub');
    assert.equal(detectRegistry('ghcr.io/linuxserver/sonarr').type, 'ghcr');
    assert.equal(detectRegistry('lscr.io/linuxserver/bazarr').type, 'lscr');
});

test('detectRegistry marks unknown hosts unsupported instead of assuming Docker Hub', () => {
    assert.equal(detectRegistry('quay.io/org/app').type, 'unsupported');
    assert.equal(detectRegistry('localhost:5000/app').type, 'unsupported');
    assert.equal(detectRegistry('gcr.io/project/app').type, 'unsupported');
});

test('buildImagePath adds the library prefix only for Docker Hub root images', () => {
    assert.equal(buildImagePath('nginx', 'dockerhub'), 'library/nginx');
    assert.equal(buildImagePath('library/nginx', 'dockerhub'), 'library/nginx');
    assert.equal(buildImagePath('user/app', 'dockerhub'), 'user/app');
    assert.equal(buildImagePath('ghcr.io/linuxserver/sonarr', 'ghcr'), 'linuxserver/sonarr');
});

test('parseNextLink resolves the rel="next" URL from a Link header', () => {
    const next = parseNextLink(
        '</v2/library/nginx/tags/list?last=1.30.1-otel&n=1000>; rel="next"',
        'https://registry-1.docker.io/v2'
    );
    assert.equal(next, 'https://registry-1.docker.io/v2/library/nginx/tags/list?last=1.30.1-otel&n=1000');
});

test('parseNextLink returns null when there is no next page', () => {
    assert.equal(parseNextLink(undefined, 'https://registry-1.docker.io/v2'), null);
    assert.equal(parseNextLink('</x>; rel="prev"', 'https://registry-1.docker.io/v2'), null);
});

test('parseNextLink passes through absolute URLs', () => {
    assert.equal(
        parseNextLink('<https://ghcr.io/v2/a/b/tags/list?last=x&n=1000>; rel="next"', 'https://ghcr.io/v2'),
        'https://ghcr.io/v2/a/b/tags/list?last=x&n=1000'
    );
});

test('parseImage preserves registry ports and normalizes official images', () => {
    assert.deepEqual(parseImage('localhost:5000/foo:1.2.3'), { image: 'localhost:5000/foo', tag: '1.2.3' });
    assert.deepEqual(parseImage('localhost:5000/foo'), { image: 'localhost:5000/foo', tag: 'latest' });
    assert.deepEqual(parseImage('nginx'), { image: 'library/nginx', tag: 'latest' });
    assert.deepEqual(parseImage('nginx:1.25'), { image: 'library/nginx', tag: '1.25' });
    assert.deepEqual(parseImage('ghcr.io/foo/bar'), { image: 'ghcr.io/foo/bar', tag: 'latest' });
    assert.deepEqual(parseImage('nginx@sha256:abc'), { image: 'library/nginx', tag: 'latest' });
});

test('evaluateUpdate prefers the bump type when a newer version exists', () => {
    const result = evaluateUpdate({
        registrySupported: true,
        currentDigest: 'sha256:aaa',
        remoteDigest: 'sha256:bbb',
        versionInfo: { newer: true, bump: 'minor' },
    });
    assert.deepEqual(result, { updateAvailable: true, updateType: 'minor', digestChanged: true, newer: true });
});

test('evaluateUpdate falls back to digest for floating tags', () => {
    const result = evaluateUpdate({
        registrySupported: true,
        currentDigest: 'sha256:aaa',
        remoteDigest: 'sha256:bbb',
        versionInfo: { newer: false, bump: null },
    });
    assert.deepEqual(result, { updateAvailable: true, updateType: 'digest', digestChanged: true, newer: false });
});

test('evaluateUpdate reports no update when nothing changed', () => {
    const result = evaluateUpdate({
        registrySupported: true,
        currentDigest: 'sha256:aaa',
        remoteDigest: 'sha256:aaa',
        versionInfo: { newer: false, bump: null },
    });
    assert.equal(result.updateAvailable, false);
    assert.equal(result.updateType, null);
});

test('evaluateUpdate never flags updates for unsupported registries', () => {
    const result = evaluateUpdate({
        registrySupported: false,
        currentDigest: 'sha256:aaa',
        remoteDigest: 'sha256:bbb',
        versionInfo: { newer: true, bump: 'major' },
    });
    assert.equal(result.updateAvailable, false);
    assert.equal(result.updateType, null);
});

test('evaluateUpdate never flags digest-pinned images', () => {
    const result = evaluateUpdate({
        registrySupported: true,
        currentDigest: 'sha256:aaa',
        remoteDigest: 'sha256:bbb',
        versionInfo: { newer: true, bump: 'minor' },
        digestPinned: true,
    });
    assert.equal(result.updateAvailable, false);
    assert.equal(result.updateType, null);
});

test('evaluateUpdate ignores digest comparison when a local digest is missing', () => {
    const result = evaluateUpdate({
        registrySupported: true,
        currentDigest: null,
        remoteDigest: 'sha256:bbb',
        versionInfo: { newer: false, bump: null },
    });
    assert.equal(result.updateAvailable, false);
});
