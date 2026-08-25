import type { RouteMeta } from '@analogjs/router';
import { authGuard } from '@org/auth';
import { LayoutComponent } from '../components/layout.component';

export const routeMeta: RouteMeta = {
  canActivateChild: [authGuard],
};

export default LayoutComponent;
