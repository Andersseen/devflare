import type { RouteMeta } from '@analogjs/router';
import { authGuard } from '@dev-auth/angular';
import { LayoutComponent } from '../components/layout.component';

export const routeMeta: RouteMeta = {
  canActivateChild: [authGuard],
};

export default LayoutComponent;
