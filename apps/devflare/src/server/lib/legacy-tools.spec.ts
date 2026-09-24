import { devtoolsUrl, legacyToolRedirect } from './legacy-tools';

describe('legacyToolRedirect', () => {
  const devtools = 'https://tools.example.dev';

  it('stays on DevFlare when no DevTools deployment is configured', () => {
    expect(legacyToolRedirect('/tools/palette', null)).toBe('/');
    expect(legacyToolRedirect('/tools', null)).toBe('/');
  });

  it('maps each old tool URL to its DevTools path', () => {
    expect(legacyToolRedirect('/tools/qr-generator', devtools)).toBe(
      `${devtools}/qr-generator`,
    );
    expect(legacyToolRedirect('/tools/bg-remover/', devtools)).toBe(
      `${devtools}/bg-remover`,
    );
  });

  it('maps the aliases the old navigation linked to', () => {
    expect(legacyToolRedirect('/tools/converter', devtools)).toBe(
      `${devtools}/data-converter`,
    );
    expect(legacyToolRedirect('/tools/recorder', devtools)).toBe(
      `${devtools}/screen-recorder`,
    );
    expect(legacyToolRedirect('/tools/shortener?x=1', devtools)).toBe(
      `${devtools}/url-shortener`,
    );
  });

  it('sends the index and unknown tools to the DevTools home', () => {
    expect(legacyToolRedirect('/tools', devtools)).toBe(`${devtools}/`);
    expect(legacyToolRedirect('/tools/', devtools)).toBe(`${devtools}/`);
    // Moved to Imageryx in PR #34 — not DevTools' to answer for.
    expect(legacyToolRedirect('/tools/image-compressor', devtools)).toBe(
      `${devtools}/`,
    );
  });
});

describe('devtoolsUrl', () => {
  const previous = process.env['DEVTOOLS_URL'];
  afterEach(() => {
    if (previous === undefined) delete process.env['DEVTOOLS_URL'];
    else process.env['DEVTOOLS_URL'] = previous;
  });

  it('reads the Cloudflare binding first and keeps only the origin', () => {
    expect(
      devtoolsUrl({
        cloudflare: { env: { DEVTOOLS_URL: 'https://t.example.dev/x/' } },
      }),
    ).toBe('https://t.example.dev');
  });

  it('is null when unset or not an http(s) URL', () => {
    delete process.env['DEVTOOLS_URL'];
    expect(devtoolsUrl({})).toBeNull();
    expect(
      devtoolsUrl({ cloudflare: { env: { DEVTOOLS_URL: 'javascript:1' } } }),
    ).toBeNull();
    expect(
      devtoolsUrl({ cloudflare: { env: { DEVTOOLS_URL: 'not a url' } } }),
    ).toBeNull();
  });
});
