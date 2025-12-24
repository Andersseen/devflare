import { Component, input, effect, ViewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-deploy-terminal',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="h-96 bg-slate-950 rounded-lg shadow-inner overflow-hidden flex flex-col font-mono text-sm border border-slate-800">
        <div class="bg-slate-900 px-4 py-2 flex items-center gap-2 border-b border-slate-800">
            <div class="w-3 h-3 rounded-full bg-red-500"></div>
            <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div class="w-3 h-3 rounded-full bg-green-500"></div>
            <span class="ml-2 text-xs text-slate-400">webcontainer-shell</span>
        </div>
        <div #terminalOutput class="flex-1 p-4 overflow-y-auto whitespace-pre-wrap text-slate-300 space-y-1 scroll-smooth">
            @for (log of logs(); track $index) {
                <div>{{ log }}</div>
            }
            @if (isDeploying()) {
                <div class="animate-pulse">_</div>
            }
        </div>
    </div>
  `
})
export class DeployTerminalComponent {
    logs = input.required<string[]>();
    isDeploying = input.required<boolean>();

    @ViewChild('terminalOutput') private terminalOutput!: ElementRef;

    constructor() {
        effect(() => {
            this.logs(); // Dependency for effect
            setTimeout(() => {
                if (this.terminalOutput?.nativeElement) {
                    this.terminalOutput.nativeElement.scrollTop = this.terminalOutput.nativeElement.scrollHeight;
                }
            }, 0);
        });
    }
}
