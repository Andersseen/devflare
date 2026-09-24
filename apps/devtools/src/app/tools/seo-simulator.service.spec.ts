import { SeoSimulator } from './seo-simulator.service';

describe('SeoSimulator', () => {
  const seo = new SeoSimulator();

  it('extracts the hostname, with a placeholder for invalid URLs', () => {
    expect(seo.getDomain('https://docs.example.org/a/b?c=1')).toBe(
      'docs.example.org',
    );
    expect(seo.getDomain('not a url')).toBe('example.com');
  });

  it('emits title, description, canonical, Open Graph and Twitter tags', () => {
    const tags = seo.generateMetaTags(
      'Title',
      'Description',
      'https://example.com/post',
      null,
    );

    expect(tags).toContain('<title>Title</title>');
    expect(tags).toContain('<meta name="description" content="Description">');
    expect(tags).toContain(
      '<link rel="canonical" href="https://example.com/post">',
    );
    expect(tags).toContain('<meta property="og:title" content="Title">');
    expect(tags).toContain(
      '<meta property="twitter:card" content="summary_large_image">',
    );
    expect(tags).toContain('<meta property="og:image" content="">');
  });

  it('uses a placeholder rather than inlining an uploaded image', () => {
    const tags = seo.generateMetaTags('T', 'D', 'https://x.dev', 'data:...');
    expect(tags).toContain('content="YOUR_IMAGE_URL"');
    expect(tags).not.toContain('data:...');
  });
});
