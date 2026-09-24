import {
  ConversionError,
  CurlConverter,
  parseCurl,
  parseFetch,
  shellQuote,
  shellSplit,
  toCurl,
} from './curl-converter.service';

const converter = new CurlConverter();

describe('shellSplit', () => {
  it('handles quotes, escapes and continuations', () => {
    expect(shellSplit(`curl 'a b' "c \\"d\\" \\$e" f\\ g \\\n  -H x`)).toEqual([
      'curl',
      'a b',
      'c "d" $e',
      'f g',
      '-H',
      'x',
    ]);
  });

  it("decodes $'…' ANSI-C strings from Chrome's Copy as cURL", () => {
    expect(shellSplit(`--data-raw $'{"a":"it\\'s\\n\\u00e9"}'`)).toEqual([
      '--data-raw',
      `{"a":"it's\né"}`,
    ]);
  });

  it('accepts Windows ^ line continuations', () => {
    expect(shellSplit('curl ^\n  https://x')).toEqual(['curl', 'https://x']);
  });

  it('refuses shell constructs it cannot evaluate', () => {
    expect(() => shellSplit('curl https://x | jq')).toThrow(/operator "\|"/);
    expect(() => shellSplit('curl -H "Authorization: $TOKEN" x')).toThrow(
      /variables/,
    );
    expect(() => shellSplit('curl $(cat url)')).toThrow(/variables/);
    expect(() => shellSplit("curl 'open")).toThrow(/Unterminated/);
  });

  it('is not a naive split on spaces', () => {
    expect(shellSplit(`curl -d 'a=1 b=2'`)).toHaveLength(3);
  });
});

describe('cURL → fetch', () => {
  it('converts a GET with headers', () => {
    const { output, warnings } = converter.curlToFetch(
      `curl https://api.example.com/items?page=2 -H 'Accept: application/json' -H "X-Trace: 1"`,
    );
    expect(output).toBe(
      [
        'const response = await fetch("https://api.example.com/items?page=2", {',
        '  headers: {',
        '    "Accept": "application/json",',
        '    "X-Trace": "1",',
        '  },',
        '});',
      ].join('\n'),
    );
    expect(warnings).toEqual([]);
  });

  it('turns a JSON body into JSON.stringify and implies POST', () => {
    const { output } = converter.curlToFetch(
      `curl https://x/api -H 'Content-Type: application/json' -d '{"name":"Ada","tags":["a"]}'`,
    );
    expect(output).toContain('method: "POST"');
    expect(output).toContain('body: JSON.stringify({');
    expect(output).toContain('"name": "Ada"');
  });

  it('uses --json like curl does: body plus JSON content headers', () => {
    const { request } = parseCurl(`curl --json '{"a":1}' https://x`);
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual([
      ['Content-Type', 'application/json'],
      ['Accept', 'application/json'],
    ]);
    expect(request.body).toMatchObject({ kind: 'json', value: { a: 1 } });
  });

  it('joins -d parts with & and defaults to form encoding', () => {
    const { request } = parseCurl(`curl -d a=1 --data-raw 'b=@2' https://x`);
    expect(request.body).toEqual({ kind: 'text', text: 'a=1&b=@2' });
    expect(request.headers).toEqual([
      ['Content-Type', 'application/x-www-form-urlencoded'],
    ]);
  });

  it('encodes --data-urlencode per curl rules', () => {
    const { request } = parseCurl(
      `curl https://x --data-urlencode 'q=hello world&x' --data-urlencode '=a b' --data-urlencode plain`,
    );
    expect(request.body).toEqual({
      kind: 'text',
      text: 'q=hello+world%26x&a+b&plain',
    });
  });

  it('moves data into the query with -G', () => {
    const { request } = parseCurl(
      `curl -G https://x/search?a=1 -d q=cats -d n=2`,
    );
    expect(request.url).toBe('https://x/search?a=1&q=cats&n=2');
    expect(request.method).toBe('GET');
    expect(request.body).toBeUndefined();
  });

  it('builds FormData for -F and drops a manual multipart Content-Type', () => {
    const { output, warnings } = converter.curlToFetch(
      `curl -F name=Ada -F 'bio=hi;type=text/plain' -H 'Content-Type: multipart/form-data' https://x/upload`,
    );
    expect(output).toContain('const body = new FormData();');
    expect(output).toContain('body.append("name", "Ada");');
    expect(output).toContain('body.append("bio", "hi");');
    expect(output).not.toContain('multipart/form-data');
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('modifiers were dropped'),
        expect.stringContaining('fetch sets multipart/form-data'),
      ]),
    );
  });

  it('warns instead of converting file uploads', () => {
    const { warnings } = parseCurl(
      `curl -F file=@photo.jpg -d @body.json https://x`,
    );
    expect(warnings).toEqual([
      expect.stringContaining('uploads a local file'),
      expect.stringContaining('reads a local file'),
    ]);
  });

  it('turns -u, --oauth2-bearer, -b, -A and -e into headers', () => {
    const { request, warnings } = parseCurl(
      `curl -u ada:s3cret --oauth2-bearer tok -b 'sid=1; x=2' -A agent/1 -e https://ref https://x`,
    );
    expect(request.headers).toEqual([
      ['Authorization', `Basic ${btoa('ada:s3cret')}`],
      ['Authorization', 'Bearer tok'],
      ['Cookie', 'sid=1; x=2'],
      ['User-Agent', 'agent/1'],
      ['Referer', 'https://ref'],
    ]);
    expect(warnings).toEqual([
      expect.stringContaining('Cookie header (it is forbidden)'),
    ]);
  });

  it('handles clustered short flags and attached values', () => {
    const { request } = parseCurl(`curl -sSLXPUT https://x -d a`);
    expect(request.method).toBe('PUT');
    expect(request.followRedirects).toBe(true);
  });

  it('supports every common method, HEAD and timeouts', () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(
        parseCurl(`curl -X ${method.toLowerCase()} https://x`).request.method,
      ).toBe(method);
    }
    expect(parseCurl('curl -I https://x').request.method).toBe('HEAD');
    expect(converter.curlToFetch('curl -m 2.5 https://x').output).toContain(
      'signal: AbortSignal.timeout(2500)',
    );
  });

  it('warns about options that change semantics', () => {
    const { warnings } = parseCurl(
      'curl -k --proxy http://p:8080 --cert c.pem --http2 --frobnicate https://x',
    );
    expect(warnings).toEqual([
      expect.stringContaining('--insecure'),
      expect.stringContaining('proxy'),
      expect.stringContaining('Client certificates'),
      expect.stringContaining('HTTP version'),
      expect.stringContaining('--frobnicate'),
    ]);
  });

  it('rejects input that is not a curl command', () => {
    expect(() => parseCurl('wget https://x')).toThrow(ConversionError);
    expect(() => parseCurl('curl -H x')).toThrow(/needs a value|No URL/);
    expect(() => parseCurl('curl -F a=1 -d b=2 https://x')).toThrow(
      /mix -F with -d/,
    );
  });

  it('assumes http:// for a bare host, as curl does', () => {
    const { request, warnings } = parseCurl('curl example.com/path');
    expect(request.url).toBe('http://example.com/path');
    expect(warnings).toEqual([expect.stringContaining('assumes http://')]);
  });
});

describe('fetch → cURL', () => {
  it('converts a plain fetch(url)', () => {
    expect(converter.fetchToCurl(`await fetch("https://x/a?b=1")`).output).toBe(
      // `?` is a glob character in zsh/bash, so the URL is quoted.
      `curl -L 'https://x/a?b=1'`,
    );
  });

  it('converts method, headers and a JSON.stringify body', () => {
    const { output, warnings } = converter.fetchToCurl(`
      const res = await fetch('https://api.example.com/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer abc\` },
        body: JSON.stringify({ name: "O'Brien", admin: false, n: -1 }),
      });`);
    expect(output).toBe(
      `curl -L https://api.example.com/users -H 'Content-Type: application/json' -H 'Authorization: Bearer abc' --data-raw '{"name":"O'\\''Brien","admin":false,"n":-1}'`,
    );
    expect(warnings).toEqual([]);
  });

  it('converts URLSearchParams bodies and Headers objects', () => {
    const { request } = parseFetch(
      `fetch("https://x", { method: "post", headers: new Headers([["X-A", "1"]]), body: new URLSearchParams({ q: "a b", n: "2" }) })`,
    );
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual([
      ['X-A', '1'],
      ['Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8'],
    ]);
    expect(request.body).toEqual({ kind: 'text', text: 'q=a+b&n=2' });
  });

  it('makes fetch’s implicit text/plain explicit for a bare string body', () => {
    const { request, warnings } = parseFetch(
      `fetch("https://x", { method: "PUT", body: "hello" })`,
    );
    expect(request.headers).toEqual([
      ['Content-Type', 'text/plain;charset=UTF-8'],
    ]);
    expect(warnings[0]).toMatch(/text\/plain/);
  });

  it('respects redirect: manual and notes options curl cannot copy', () => {
    const { output, warnings } = converter.fetchToCurl(
      `window.fetch("https://x", { redirect: "manual", credentials: "include", cache: "no-store" })`,
    );
    expect(output).toBe('curl https://x');
    expect(warnings).toEqual([
      expect.stringContaining('credentials'),
      expect.stringContaining('"cache" has no curl equivalent'),
    ]);
  });

  it('reports constructs it cannot evaluate instead of guessing', () => {
    expect(() => parseFetch('fetch(url)')).toThrow(/"url" is a variable/);
    expect(() => parseFetch('fetch(`https://x/${id}`)')).toThrow(
      /Template literal/,
    );
    expect(() => parseFetch('fetch("https://x", { headers })')).toThrow(
      /Shorthand property/,
    );
    expect(() =>
      parseFetch('fetch("https://x", { method: "POST", body: getBody() })'),
    ).toThrow(/Function call/);
    expect(() => parseFetch('fetch("https://x", { body: "x" })')).toThrow(
      /body on a GET/,
    );
    expect(() => parseFetch('fetch("https://x",')).toThrow(
      /Not valid JavaScript/,
    );
    expect(() => parseFetch('console.log(1)')).toThrow(/No fetch/);
  });
});

describe('round trips', () => {
  const cases = [
    `curl -L https://x/a -H 'Accept: application/json'`,
    `curl -X DELETE -L https://x/items/1 -H 'Authorization: Bearer t'`,
    `curl -L https://x -H 'Content-Type: application/json' --data-raw '{"a":[1,2]}'`,
    `curl -X PATCH -L https://x -H 'Content-Type: text/plain' --data-raw 'it'\\''s'`,
  ];

  it.each(cases)('curl → model → curl keeps %s', (command) => {
    expect(toCurl(parseCurl(command).request)).toBe(command);
  });

  it('fetch → curl → fetch keeps the request', () => {
    const source = `fetch("https://x/api", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: 1 }) })`;
    const curl = converter.fetchToCurl(source).output;
    const back = parseCurl(curl).request;
    expect(back).toMatchObject({
      url: 'https://x/api',
      method: 'PUT',
      headers: [['Content-Type', 'application/json']],
      body: { kind: 'json', value: { a: 1 } },
    });
  });

  it('quotes only when the shell needs it', () => {
    expect(shellQuote('https://x/a/b')).toBe('https://x/a/b');
    expect(shellQuote('https://x/a?b=1')).toBe(`'https://x/a?b=1'`);
    expect(shellQuote('a b')).toBe(`'a b'`);
    expect(shellQuote(`it's`)).toBe(`'it'\\''s'`);
    expect(shellSplit(`curl ${shellQuote(`$HOME & "it's"`)}`)[1]).toBe(
      `$HOME & "it's"`,
    );
  });
});
