import type { RequestUser } from '../common/types/request-user.js';

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export {};
