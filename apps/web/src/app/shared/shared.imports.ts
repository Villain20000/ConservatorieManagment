import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AvatarComponent } from './ui/avatar';
import { ChartComponent } from './ui/chart';
import { DrawerComponent } from './ui/drawer';
import { EmptyStateComponent } from './ui/empty-state';
import { IconComponent } from './ui/icon';
import { PageHeaderComponent } from './ui/page-header';
import { PaginationComponent } from './ui/pagination';
import { ProgressComponent } from './ui/progress';
import { StatCardComponent } from './ui/stat-card';
import { StatusBadgeComponent } from './ui/status-badge';

export const SHARED_IMPORTS = [
  CommonModule,
  RouterLink,
  RouterLinkActive,
  TranslocoPipe,
  IconComponent,
  PageHeaderComponent,
  StatCardComponent,
  StatusBadgeComponent,
  AvatarComponent,
  EmptyStateComponent,
  DrawerComponent,
  PaginationComponent,
  ProgressComponent,
  ChartComponent,
];

export {
  AvatarComponent,
  ChartComponent,
  DrawerComponent,
  EmptyStateComponent,
  IconComponent,
  PageHeaderComponent,
  PaginationComponent,
  ProgressComponent,
  StatCardComponent,
  StatusBadgeComponent,
};
