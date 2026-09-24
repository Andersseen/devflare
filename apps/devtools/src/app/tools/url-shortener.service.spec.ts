import { UrlShortener, type HistoryItem } from './url-shortener.service';

describe('UrlShortener', () => {
  const shortener = new UrlShortener();

  beforeEach(() => localStorage.clear());

  it('validates absolute URLs only', () => {
    expect(shortener.isValidUrl('https://example.com/a')).toBe(true);
    expect(shortener.isValidUrl('example.com')).toBe(false);
    expect(shortener.isValidUrl('')).toBe(false);
  });

  it('keeps a custom alias and generates one otherwise', () => {
    expect(shortener.shorten('https://x.dev', 'docs').slug).toBe('docs');
    expect(shortener.shorten('https://x.dev').slug).toMatch(/^[a-z0-9]{1,6}$/);
  });

  it('builds the short link on the current origin', () => {
    const { shortUrl } = shortener.shorten('https://x.dev', 'docs');
    expect(shortUrl).toBe(`${window.location.origin}/s/docs`);
  });

  it('persists history in this browser only', () => {
    const history: HistoryItem[] = [
      {
        originalUrl: 'https://x.dev',
        shortUrl: 'http://localhost/s/a',
        slug: 'a',
        createdAt: 1,
      },
    ];

    expect(shortener.loadHistory()).toEqual([]);
    shortener.saveHistory(history);
    expect(shortener.loadHistory()).toEqual(history);
  });

  it('survives corrupt stored history', () => {
    localStorage.setItem('shortener_history', '{broken');
    expect(shortener.loadHistory()).toEqual([]);
  });
});
