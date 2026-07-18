import { Router } from "express";
import { z } from "zod";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { sendApiError } from "../utils/apiError.js";
import { getCredentials } from "./cf.js";
import {
  cloudflareService,
  defaultActionForKind,
  rulePhaseForKind,
  type RuleKind,
} from "../services/cloudflare.js";

export const rulesRouter = Router();

rulesRouter.use(requireAuth);

const RULE_KINDS: RuleKind[] = ["redirect", "cache", "configuration"];

function parseKind(value: string): RuleKind | null {
  return (RULE_KINDS as string[]).includes(value) ? (value as RuleKind) : null;
}

const ruleBodySchema = z.object({
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional(),
  expression: z.string().min(1),
  action: z.string().min(1).optional(),
  actionParameters: z.record(z.string(), z.unknown()).optional(),
});

const reorderBodySchema = z.object({
  rules: z
    .array(
      z.object({
        enabled: z.boolean().optional(),
        description: z.string().max(500).optional(),
        expression: z.string().min(1),
        action: z.string().min(1).optional(),
        actionParameters: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1),
});

function invalidKindResponse(res: any, kind: string) {
  return sendApiError(res, new Error(`Unsupported rule kind: ${kind}`), {
    status: 400,
    code: "RULE_KIND_UNSUPPORTED",
    detail: `Unsupported rule kind: ${kind}`,
  });
}

// GET /api/rules/:zoneId/:kind
rulesRouter.get("/:zoneId/:kind", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, kind } = req.params;
  const ruleKind = parseKind(kind);
  if (!ruleKind) return invalidKindResponse(res, kind);

  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const result = await cloudflareService.getRulesetRules(credentials, zoneId, rulePhaseForKind(ruleKind));
    return res.json({
      rules: result.rules,
      quota: { used: result.rules.length },
      warnings: [],
    });
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "RULES_LIST_FAILED",
      detail: "Failed to fetch rules",
    });
  }
});

// POST /api/rules/:zoneId/:kind
rulesRouter.post("/:zoneId/:kind", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, kind } = req.params;
  const ruleKind = parseKind(kind);
  if (!ruleKind) return invalidKindResponse(res, kind);

  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const body = ruleBodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const rule = await cloudflareService.createRulesetRule(credentials, zoneId, rulePhaseForKind(ruleKind), {
      enabled: body.enabled,
      description: body.description,
      expression: body.expression,
      action: body.action ?? defaultActionForKind(ruleKind),
      actionParameters: body.actionParameters,
    });
    return res.status(201).json(rule);
  } catch (error) {
    return sendApiError(res, error, {
      status: 400,
      code: "RULE_CREATE_FAILED",
      detail: "Failed to create rule",
    });
  }
});

// PUT /api/rules/:zoneId/:kind/:ruleId
rulesRouter.put("/:zoneId/:kind/:ruleId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, kind, ruleId } = req.params;
  const ruleKind = parseKind(kind);
  if (!ruleKind) return invalidKindResponse(res, kind);

  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const body = ruleBodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const rule = await cloudflareService.updateRulesetRule(
      credentials,
      zoneId,
      rulePhaseForKind(ruleKind),
      ruleId,
      {
        enabled: body.enabled,
        description: body.description,
        expression: body.expression,
        action: body.action ?? defaultActionForKind(ruleKind),
        actionParameters: body.actionParameters,
      },
    );
    return res.json(rule);
  } catch (error) {
    return sendApiError(res, error, {
      status: 400,
      code: "RULE_UPDATE_FAILED",
      detail: "Failed to update rule",
    });
  }
});

// DELETE /api/rules/:zoneId/:kind/:ruleId
rulesRouter.delete("/:zoneId/:kind/:ruleId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, kind, ruleId } = req.params;
  const ruleKind = parseKind(kind);
  if (!ruleKind) return invalidKindResponse(res, kind);

  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    await cloudflareService.deleteRulesetRule(credentials, zoneId, rulePhaseForKind(ruleKind), ruleId);
    return res.status(204).send();
  } catch (error) {
    return sendApiError(res, error, {
      status: 400,
      code: "RULE_DELETE_FAILED",
      detail: "Failed to delete rule",
    });
  }
});

// POST /api/rules/:zoneId/:kind/reorder
rulesRouter.post("/:zoneId/:kind/reorder", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, kind } = req.params;
  const ruleKind = parseKind(kind);
  if (!ruleKind) return invalidKindResponse(res, kind);

  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const body = reorderBodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const result = await cloudflareService.reorderRulesetRules(
      credentials,
      zoneId,
      rulePhaseForKind(ruleKind),
      body.rules.map((rule) => ({
        enabled: rule.enabled,
        description: rule.description,
        expression: rule.expression,
        action: rule.action ?? defaultActionForKind(ruleKind),
        actionParameters: rule.actionParameters,
      })),
    );
    return res.json({
      rules: result.rules,
      quota: { used: result.rules.length },
      warnings: [],
    });
  } catch (error) {
    return sendApiError(res, error, {
      status: 400,
      code: "RULE_REORDER_FAILED",
      detail: "Failed to reorder rules",
    });
  }
});
