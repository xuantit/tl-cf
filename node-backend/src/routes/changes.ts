import { Router } from "express";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { sendApiError } from "../utils/apiError.js";
import { getCredentials } from "./cf.js";
import {
  getChangeSetById,
  getRollbackPreview,
  listChangeSets,
  markChangeSetStatus,
} from "../services/changes.js";
import { executeDnsRollback } from "../services/rollback.js";

export const changesRouter = Router();

changesRouter.use(requireAuth);

changesRouter.get("/", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const limitRaw = req.query.limit as string | undefined;
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const changes = await listChangeSets(auth.userId, {
      limit: Number.isFinite(limit) ? limit : undefined,
      accountId: req.query.accountId as string | undefined,
      zoneId: req.query.zoneId as string | undefined,
      action: req.query.action as string | undefined,
    });
    return res.json(changes);
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "CHANGESET_LIST_FAILED",
      detail: "Failed to list change history",
    });
  }
});

changesRouter.get("/:id", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const changeSet = await getChangeSetById(req.params.id);
    if (!changeSet || changeSet.ownerId !== auth.userId) {
      return sendApiError(res, new Error("Change not found"), {
        status: 404,
        code: "CHANGESET_NOT_FOUND",
        detail: "Change not found",
      });
    }
    return res.json(changeSet);
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "CHANGESET_READ_FAILED",
      detail: "Failed to get change details",
    });
  }
});

changesRouter.post("/:id/rollback-preview", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const preview = await getRollbackPreview(req.params.id, auth.userId);
    if (!preview) {
      return sendApiError(res, new Error("Change not found"), {
        status: 404,
        code: "CHANGESET_NOT_FOUND",
        detail: "Change not found",
      });
    }
    if (!preview.reversible) {
      return sendApiError(res, new Error("Change is not reversible"), {
        status: 400,
        code: "CHANGESET_NOT_REVERSIBLE",
        detail: "Change is not reversible",
      });
    }
    return res.json(preview);
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "ROLLBACK_PREVIEW_FAILED",
      detail: "Failed to build rollback preview",
    });
  }
});

changesRouter.post("/:id/rollback", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const changeSet = await getChangeSetById(req.params.id);
    if (!changeSet || changeSet.ownerId !== auth.userId) {
      return sendApiError(res, new Error("Change not found"), {
        status: 404,
        code: "CHANGESET_NOT_FOUND",
        detail: "Change not found",
      });
    }
    if (!changeSet.reversible) {
      return sendApiError(res, new Error("Change is not reversible"), {
        status: 400,
        code: "CHANGESET_NOT_REVERSIBLE",
        detail: "Change is not reversible",
      });
    }

    const autoRollbackPrefixes = ["dns.", "cache.", "ssl."];
    const isAutoRollback =
      typeof changeSet.action === "string" &&
      autoRollbackPrefixes.some((prefix) => changeSet.action.startsWith(prefix));
    if (!isAutoRollback) {
      await markChangeSetStatus(changeSet.id, "rollback_requested");
      return res.status(202).json({
        id: changeSet.id,
        status: "rollback_requested",
        mode: "manual_snapshot",
        detail: "Automatic rollback is only supported for DNS, cache, and SSL changes in this phase.",
      });
    }

    const operations = await executeDnsRollback(
      changeSet,
      await getCredentials(changeSet.ownerId, changeSet.accountId ?? undefined),
    );
    const hasError = operations.some((op) => op.status === "error");
    const finalStatus = hasError ? "rollback_failed" : "rolled_back";
    const updated = await markChangeSetStatus(changeSet.id, finalStatus);

    return res.status(hasError ? 207 : 200).json({
      id: updated.id,
      status: updated.status,
      mode: "auto",
      operations,
    });
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "ROLLBACK_REQUEST_FAILED",
      detail: "Failed to request rollback",
    });
  }
});
