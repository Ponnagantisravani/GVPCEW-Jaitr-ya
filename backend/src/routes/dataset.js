import { Router } from '../utils/router.js';
import { z } from "zod";
import { pool } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getPrivateImage } from "../utils/objectStorage.js";
import { requireDatasetAdminKey } from "../middleware/datasetAuth.js";

export const datasetRouter = Router();
datasetRouter.use(requireDatasetAdminKey);

datasetRouter.get("/stats", asyncHandler(async (_req, res) => {
  const result = await pool.query(`select count(distinct roll_number)::int as people, count(*)::int as images from dataset_images`);
  res.json(result.rows[0]);
}));

datasetRouter.get("/manifest", asyncHandler(async (req, res) => {
  const parsed = z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(500).default(100) }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: "Invalid manifest query" });
  const { offset, limit } = parsed.data;
  const result = await pool.query(
    `select id, roll_number, original_name, checksum, content_type, byte_size, created_at
     from dataset_images order by created_at asc, id asc limit $1 offset $2`, [limit, offset]
  );
  res.json({ images: result.rows, nextOffset: result.rows.length === limit ? offset + result.rows.length : null });
}));

datasetRouter.get("/images/:id", asyncHandler(async (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ message: "Invalid image id" });
  const result = await pool.query("select original_name, storage_key, content_type from dataset_images where id = $1", [parsed.data]);
  if (!result.rowCount) return res.status(404).json({ message: "Image not found" });
  const image = result.rows[0];
  const object = await getPrivateImage(image.storage_key);
  res.setHeader("Content-Type", image.content_type);
  res.setHeader("Content-Disposition", `attachment; filename=\"${image.original_name.replace(/\"/g, "")}\"`);
  object.Body.pipe(res);
}));
