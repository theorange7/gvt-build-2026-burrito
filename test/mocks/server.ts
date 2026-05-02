import { setupServer } from 'msw/node';
import { handlers } from './handlers';
import { gitlabHandlers } from './gitlab';

export const server = setupServer(...handlers, ...gitlabHandlers);
