/*
 * Side-effect imports — each provider's module registers itself with the
 * in-memory registry on import. Add a new provider by adding one line here
 * and a new folder under src/lib/providers/<id>/.
 */
import './gitlab-dedicated';

export * from './types';
export * from './registry';
export * from './config';
