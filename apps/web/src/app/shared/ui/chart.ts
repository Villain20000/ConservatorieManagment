import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { ThemeService } from '../../core/theme.service';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

@Component({
  selector: 'app-chart',
  template: `<div #host class="w-full" [style.height.px]="height()"></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartComponent implements OnDestroy {
  private readonly theme = inject(ThemeService);
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  readonly options = input.required<EChartsCoreOption>();
  readonly height = input(260);

  private chart: echarts.ECharts | null = null;
  private observer: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      const element = this.host().nativeElement;
      this.chart = echarts.init(element, undefined, { renderer: 'canvas' });
      this.chart.setOption(this.options(), true);
      this.observer = new ResizeObserver(() => this.chart?.resize());
      this.observer.observe(element);
    });

    effect(() => {
      const options = this.options();
      this.theme.theme();
      if (this.chart) {
        this.chart.setOption(options, true);
      }
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.chart?.dispose();
  }
}
