import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavSection as NavbarSection } from '@ui-components/navbar.component';
import { LucideAngularModule } from 'lucide-angular';

interface NavItem {
  title: string;
  path: string;
  iconName: string;
  exactMatch?: boolean;
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

@Component({
  selector: 'ui-sidebar-nav',
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  providers: [],
  template: `
    <nav class="p-4 space-y-1">
      @for (group of displayedGroups(); track group.title) { @if (group.title) {
      <div class="px-3 mb-2 mt-4 first:mt-2">
        <h3
          class="text-xs font-semibold text-text-muted uppercase tracking-wider group-[.collapsed]:hidden"
        >
          {{ group.title }}
        </h3>
      </div>
      } @for (item of group.items; track item.path) {
      <a
        [routerLink]="item.path"
        routerLinkActive="bg-accent text-accent-foreground"
        [routerLinkActiveOptions]="{ exact: item.exactMatch === true }"
        (click)="linkClicked()"
        class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary text-text-muted font-medium transition-colors cursor-pointer group/link whitespace-nowrap overflow-hidden"
      >
        <lucide-icon
          [name]="item.iconName"
          [size]="20"
          class="min-w-[1.25rem] group-hover/link:text-primary"
        ></lucide-icon>
        <span class="group-[.collapsed]:hidden transition-all duration-300">{{ item.title }}</span>
      </a>
      } }
    </nav>
  `,
})
export class SidebarNavComponent {
  activeSectionInput = signal<NavbarSection>('deployment');
  @Input() set activeSection(val: NavbarSection) {
    this.activeSectionInput.set(val);
  }

  @Output() linkClick = new EventEmitter<void>();

  // Configuration
  private deploymentGroups: NavGroup[] = [
    {
      items: [
        { title: 'Dashboard', path: '/deploy/dashboard', iconName: 'layout-dashboard' },
        { title: 'Apps', path: '/deploy', iconName: 'app-window', exactMatch: true },
      ],
    },
    {
      title: 'Storage',
      items: [{ title: 'Buckets', path: '/storage/explorer', iconName: 'database' }],
    },
  ];

  private toolsGroups: NavGroup[] = [
    {
      title: 'Media',
      items: [
        { title: 'Image Tools', path: '/tools/compressor', iconName: 'image' },
        { title: 'Social Card', path: '/tools/og-generator', iconName: 'receipt' },
        { title: 'SEO Simulator', path: '/tools/seo-simulator', iconName: 'search' },
        { title: 'Cinematic Palette', path: '/tools/palette', iconName: 'palette' },
        { title: 'SVG Optimizer', path: '/tools/svg-optimizer', iconName: 'wand-2' },
        { title: 'Background Remover', path: '/tools/bg-remover', iconName: 'scissors' },
      ],
    },
    {
      title: 'Recorder',
      items: [{ title: 'Screen Recorder', path: '/tools/recorder', iconName: 'video' }],
    },
    {
      title: 'Data',
      items: [
        { title: 'QR Studio', path: '/tools/qr-generator', iconName: 'qr-code' },
        { title: 'Data Converter', path: '/tools/converter', iconName: 'file-json' },
      ],
    },
    {
      title: 'Cloud',
      items: [{ title: 'URL Shortener', path: '/tools/shortener', iconName: 'link-2' }],
    },
  ];

  displayedGroups = computed(() => {
    return this.activeSectionInput() === 'deployment' ? this.deploymentGroups : this.toolsGroups;
  });

  linkClicked() {
    this.linkClick.emit();
  }
}
