import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { VoltCard, VoltCardContent, VoltBadge } from '@voltui/components';
import { Auth } from '@org/auth';

interface Tool {
  title: string;
  description: string;
  link: string;
  icon: string;
  colorClass: string;
  bgClass: string;
}

@Component({
  selector: 'app-home-page',
  imports: [
    RouterLink,
    LucideAngularModule,
    VoltCard,
    VoltCardContent,
    VoltBadge,
  ],
  template: `
    <div class="space-y-10">
      <!-- Hero -->
      <div class="text-center space-y-4 py-4">
        <h1
          class="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-indigo-500 pb-2"
        >
          Developer Tools, Reimagined.
        </h1>
        <p class="text-xl text-muted-foreground max-w-2xl mx-auto">
          A suite of powerful, client-side tools to help you build, optimize,
          and deploy faster. No server required.
        </p>
        @if (auth.user(); as user) {
          <p class="text-sm text-muted-foreground">
            Welcome back,
            <span class="font-medium text-foreground">{{
              user.name || user.email
            }}</span>
          </p>
        }
      </div>

      <!-- Tools Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        @for (tool of tools; track tool.title) {
          <a [routerLink]="tool.link" class="group cursor-pointer">
            <volt-card
              class="h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border-border hover:border-primary/30"
            >
              <volt-card-content>
                <div class="p-2 space-y-4 flex-1">
                  <div
                    class="w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                    [class]="tool.bgClass"
                  >
                    <lucide-icon
                      [name]="tool.icon"
                      class="w-6 h-6"
                      [class]="tool.colorClass"
                    />
                  </div>
                  <div>
                    <h3
                      class="text-xl font-bold transition-colors group-hover:text-primary"
                    >
                      {{ tool.title }}
                    </h3>
                    <p class="text-muted-foreground mt-2 text-sm">
                      {{ tool.description }}
                    </p>
                  </div>
                </div>
              </volt-card-content>
            </volt-card>
          </a>
        }
      </div>
    </div>
  `,
})
export default class HomePage {
  auth = inject(Auth);

  tools: Tool[] = [
    {
      title: 'Image Compressor',
      description:
        'Optimize PNG, JPEG, and WEBP images locally with WebWorkers.',
      link: '/tools/image-compressor',
      icon: 'image',
      colorClass: 'text-blue-500',
      bgClass: 'bg-blue-500/10',
    },
    {
      title: 'QR Code Studio',
      description:
        'Generate customizable QR codes for URLs, text, and Wi-Fi networks.',
      link: '/tools/qr-generator',
      icon: 'qr-code',
      colorClass: 'text-pink-500',
      bgClass: 'bg-pink-500/10',
    },
    {
      title: 'SVG Optimizer',
      description: 'Minify and clean up SVG code directly in your browser.',
      link: '/tools/svg-optimizer',
      icon: 'scissors',
      colorClass: 'text-orange-500',
      bgClass: 'bg-orange-500/10',
    },
    {
      title: 'SEO Simulator',
      description:
        'Preview how your pages appear on Google, Twitter, and Facebook.',
      link: '/tools/seo-simulator',
      icon: 'search',
      colorClass: 'text-sky-500',
      bgClass: 'bg-sky-500/10',
    },
    {
      title: 'Data Converter',
      description: 'Convert between JSON and CSV formats instantly.',
      link: '/tools/converter',
      icon: 'arrow-right-left',
      colorClass: 'text-cyan-500',
      bgClass: 'bg-cyan-500/10',
    },
    {
      title: 'Screen Recorder',
      description:
        'Record your screen directly from the browser without plugins.',
      link: '/tools/recorder',
      icon: 'video',
      colorClass: 'text-red-500',
      bgClass: 'bg-red-500/10',
    },
    {
      title: 'Social Card Designer',
      description:
        'Create beautiful Open Graph images for your social media posts.',
      link: '/tools/og-generator',
      icon: 'globe',
      colorClass: 'text-purple-500',
      bgClass: 'bg-purple-500/10',
    },
    {
      title: 'Cinematic Palette',
      description: 'Extract dominant colors and create cinematic compositions.',
      link: '/tools/palette',
      icon: 'brush',
      colorClass: 'text-fuchsia-500',
      bgClass: 'bg-fuchsia-500/10',
    },
    {
      title: 'Background Remover',
      description: 'Remove image backgrounds using AI completely client-side.',
      link: '/tools/bg-remover',
      icon: 'paint-bucket',
      colorClass: 'text-emerald-600',
      bgClass: 'bg-emerald-600/10',
    },
    {
      title: 'URL Shortener',
      description:
        'Shorten long links and keep track of them with custom aliases.',
      link: '/tools/shortener',
      icon: 'link',
      colorClass: 'text-indigo-500',
      bgClass: 'bg-indigo-500/10',
    },
    {
      title: 'Deploy',
      description: 'Build and deploy Node.js applications using WebContainers.',
      link: '/deploy',
      icon: 'zap',
      colorClass: 'text-green-500',
      bgClass: 'bg-green-500/10',
    },
    {
      title: 'Projects',
      description: 'Manage your deployed projects and view deployment history.',
      link: '/projects',
      icon: 'folder-open',
      colorClass: 'text-primary',
      bgClass: 'bg-primary/10',
    },
  ];
}
