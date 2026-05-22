import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SeoSimulator {
  getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'example.com';
    }
  }

  generateMetaTags(
    title: string,
    description: string,
    url: string,
    imageSrc: string | null
  ): string {
    const image = imageSrc ? 'YOUR_IMAGE_URL' : '';
    return `
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${url}">

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">

<!-- Twitter -->
<meta property="twitter:card" content="summary_large_image">
<meta property="twitter:url" content="${url}">
<meta property="twitter:title" content="${title}">
<meta property="twitter:description" content="${description}">
<meta property="twitter:image" content="${image}">
    `.trim();
  }
}
