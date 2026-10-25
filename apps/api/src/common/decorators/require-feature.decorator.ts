import { SetMetadata } from '@nestjs/common';
import type { FeatureKey } from '../entitlements.types.js';

export const FEATURE_KEY = 'requiresFeature';

/**
 * Declares that a route (or controller) needs a plan feature. Enforced by
 * `FeatureGuard`, which reads the metadata via `getAllAndOverride`, so a
 * handler-level declaration wins over the controller-level one.
 */
export const RequiresFeature = (feature: FeatureKey) => SetMetadata(FEATURE_KEY, feature);
