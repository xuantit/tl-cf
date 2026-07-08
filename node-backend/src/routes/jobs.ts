import { Router } from "express";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { getJobWithHistory, listJobs } from "../services/jobRunner.js";

export const jobsRouter = Router();

jobsRouter.use(requireAuth);

// List the caller's job history (persisted, newest first)
jobsRouter.get("/", async (req, res, next) => {
  try {
    const auth = req.auth as AuthUser;
    const jobs = await listJobs(auth.userId);
    return res.json(jobs);
  } catch (error) {
    return next(error);
  }
});

jobsRouter.get("/:id", async (req, res, next) => {
  try {
    const auth = req.auth as AuthUser;
    const job = await getJobWithHistory(req.params.id);
    if (!job || job.ownerId !== auth.userId) {
      return res.status(404).json({ detail: "Job not found" });
    }
    return res.json(job);
  } catch (error) {
    return next(error);
  }
});
