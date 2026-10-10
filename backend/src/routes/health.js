import { Router } from '../utils/router.js';

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok", service: "gvpcew-attendance-backend" });
});
