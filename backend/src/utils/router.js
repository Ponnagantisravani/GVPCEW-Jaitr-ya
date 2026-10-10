import { Router as ExpressRouter } from 'express';
import { asyncHandler } from './asyncHandler.js';
export function Router(options) {
  const router = ExpressRouter(options);
  for (const method of ['get','post','put','patch','delete','options','head']) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) => original(path, ...handlers.flat(Infinity).map(handler =>
      typeof handler === 'function' && handler.length < 4 ? asyncHandler(handler) : handler));
  }
  return router;
}
