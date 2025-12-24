import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardComponent } from '@ui-components/card.component';
import { CommonModule } from '@angular/common';

interface Tool {
    title: string;
    description: string;
    link: string;
    icon: string;
    colorClass: string;
    bgClass: string;
}

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [RouterLink, CardComponent, CommonModule],
    template: `
    <div class="p-6 md:p-12 max-w-7xl mx-auto space-y-12">
      
      <!-- Hero Section -->
      <div class="text-center space-y-4 py-8">
         <h1 class="text-4xl md:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-indigo-600 pb-2">
             Developer Tools, Reimagined.
         </h1>
         <p class="text-xl text-text-muted max-w-2xl mx-auto">
             A suite of powerful, client-side tools to help you build, optimize, and deploy faster. No server required.
         </p>
      </div>

      <!-- Tools Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          @for (tool of tools; track tool.title) {
              <ui-card 
                class="flex flex-col h-full transition-all duration-300 group cursor-pointer hover:-translate-y-1 hover:shadow-lg" 
                [ngClass]="'hover:border-' + tool.colorClass + '/50'"
                [routerLink]="tool.link">
                  <div class="p-6 space-y-4 flex-1">
                      <div 
                        class="w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                        [ngClass]="[tool.bgClass, 'text-' + tool.colorClass]">
                          <div [innerHTML]="tool.icon"></div>
                      </div>
                      <div>
                          <h3 
                            class="text-xl font-bold text-text transition-colors"
                            [ngClass]="'group-hover:text-' + tool.colorClass">
                            {{ tool.title }}
                          </h3>
                          <p class="text-text-muted mt-2">{{ tool.description }}</p>
                      </div>
                  </div>
              </ui-card>
          }

      </div>
    </div>
  `
})
export class HomeComponent {
    tools: Tool[] = [
        {
            title: 'Image Compressor',
            description: 'Optimize generic PNG, JPEG, and WEBP images locally with WebAssembly.',
            link: '/tools/compressor',
            colorClass: 'primary',
            bgClass: 'bg-primary/10',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>`
        },
        {
            title: 'URL Shortener',
            description: 'Shorten long links and track them with custom aliases.',
            link: '/tools/shortener',
            colorClass: 'indigo-500',
            bgClass: 'bg-indigo-500/10',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>`
        },
        {
            title: 'Cloud Storage',
            description: 'Manage your Cloudflare R2 buckets directly from the browser.',
            link: '/storage/explorer',
            colorClass: 'blue-500',
            bgClass: 'bg-blue-500/10',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>`
        },
        {
            title: 'Site Deployer',
            description: 'Build and deploy Node.js applications using WebContainers.',
            link: '/deploy',
            colorClass: 'green-500',
            bgClass: 'bg-green-500/10',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>`
        },
        {
            title: 'Social Card Designer',
            description: 'Create beautiful Open Graph images for your social media posts.',
            link: '/tools/og-generator',
            colorClass: 'purple-500',
            bgClass: 'bg-purple-500/10',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>`
        },
        {
            title: 'SEO Simulator',
            description: 'Preview how your pages appear on Google, Twitter, and Facebook.',
            link: '/tools/seo-simulator',
            colorClass: 'sky-500',
            bgClass: 'bg-sky-500/10',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" /></svg>`
        },
        {
            title: 'SVG Optimizer',
            description: 'Minify and clean up SVG code directly in your browser.',
            link: '/tools/svg-optimizer',
            colorClass: 'orange-500',
            bgClass: 'bg-orange-500/10',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>`
        },
        {
            title: 'QR Studio',
            description: 'Generate customizable QR codes for links and Wi-Fi access.',
            link: '/tools/qr-generator',
            colorClass: 'pink-500',
            bgClass: 'bg-pink-500/10',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM14.625 3.75c-.621 0-1.125.504-1.125 1.125v4.5c0 .621.504 1.125 1.125 1.125h4.5c.621 0 1.125-.504 1.125-1.125v-4.5c0-.621-.504-1.125-1.125-1.125h-4.5z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 15h.008v.008H15V15zm0 3.75h.008v.008H15v-.008zm3.75-3.75h.008v.008H18.75V15zm0 3.75h.008v.008H18.75v-.008z" /><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 13.5v9m-4.5-4.5h9" /></svg>`
        },
        {
            title: 'Data Converter',
            description: 'Convert between JSON and CSV formats instantly.',
            link: '/tools/converter',
            colorClass: 'cyan-500',
            bgClass: 'bg-cyan-500/10',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>`
        },
        {
            title: 'Screen Recorder',
            description: 'Record your screen directly from the browser without plugins.',
            link: '/tools/recorder',
            colorClass: 'red-500',
            bgClass: 'bg-red-500/10',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>`
        },
        {
            title: 'Background Remover',
            description: 'Remove image backgrounds using AI completely client-side.',
            link: '/tools/bg-remover',
            colorClass: 'emerald-600',
            bgClass: 'bg-emerald-600/10',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>`
        },
        {
            title: 'Cinematic Palette',
            description: 'Extract dominant colors and create cinematic compositions.',
            link: '/tools/palette',
            colorClass: 'fuchsia-500',
            bgClass: 'bg-fuchsia-500/10',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z" /></svg>`
        }
    ];
}
