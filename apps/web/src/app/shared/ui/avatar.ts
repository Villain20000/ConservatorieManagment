import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormatService } from '../../core/format.service';

const PALETTE = [
  'bg-[#E9DFC9] text-[#6B5226] dark:bg-[#33291A] dark:text-[#DCC08F]',
  'bg-[#DCE8E1] text-[#385C4A] dark:bg-[#172A21] dark:text-[#9ACAB2]',
  'bg-[#DFE4F0] text-[#40537A] dark:bg-[#1A2333] dark:text-[#A6B7D9]',
  'bg-[#F0DEDE] text-[#7A4040] dark:bg-[#2E1B1B] dark:text-[#D8A0A0]',
  'bg-[#E8E0EC] text-[#63456F] dark:bg-[#271C2C] dark:text-[#C9A9D4]',
];

@Component({
  selector: 'app-avatar',
  template: `
    <span
      class="inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase tracking-wide"
      [class]="paletteClass()"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.font-size.px]="size() * 0.34"
      [attr.aria-label]="firstName() + ' ' + lastName()"
    >
      {{ initials() }}
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarComponent {
  private readonly format = inject(FormatService);

  readonly firstName = input.required<string>();
  readonly lastName = input.required<string>();
  readonly size = input(36);

  readonly initials = computed(() => this.format.initials(this.firstName(), this.lastName()));

  readonly paletteClass = computed(() => {
    const source = `${this.firstName()}${this.lastName()}`;
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
      hash = (hash * 31 + source.charCodeAt(index)) % 9973;
    }
    return PALETTE[hash % PALETTE.length];
  });
}
