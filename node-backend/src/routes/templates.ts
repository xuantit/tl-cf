import { Router } from "express";
import { z } from "zod";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { cloudflareService, type DnsRecord } from "../services/cloudflare.js";
import { prisma } from "../services/db.js";
import { createJob } from "../services/jobRunner.js";
import { getCredentials } from "./cf.js";
import logger from "../utils/logger.js";

export const templatesRouter = Router();

templatesRouter.use(requireAuth);

const templateRecordSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  content: z.string().min(1),
  ttl: z.number().optional(),
  proxied: z.boolean().optional(),
  priority: z.number().optional(),
});

export type TemplateRecord = z.infer<typeof templateRecordSchema>;

const templateBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  records: z.array(templateRecordSchema),
});

function serializeTemplate(t: { id: string; name: string; description: string | null; recordsJson: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: t.id,
    name: t.name,
    description: t.description || undefined,
    records: JSON.parse(t.recordsJson) as TemplateRecord[],
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// Resolve {domain} placeholder and "@" to the actual zone name
function resolveRecordForZone(record: TemplateRecord, zoneName: string): TemplateRecord {
  const resolveField = (value: string) => {
    let out = value.replace(/\{domain\}/g, zoneName);
    if (out === "@") out = zoneName;
    return out;
  };
  return {
    ...record,
    name: resolveField(record.name),
    content: resolveField(record.content),
  };
}

templatesRouter.get("/", async (req, res) => {
  try {
    const auth = req.auth as AuthUser;
    const templates = await prisma.dnsTemplate.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
    });
    res.json(templates.map(serializeTemplate));
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to list templates" });
  }
});

templatesRouter.post("/", async (req, res) => {
  try {
    const auth = req.auth as AuthUser;
    const body = templateBodySchema.parse(req.body);
    const template = await prisma.dnsTemplate.create({
      data: {
        userId: auth.userId,
        name: body.name,
        description: body.description,
        recordsJson: JSON.stringify(body.records),
      },
    });
    res.status(201).json(serializeTemplate(template));
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to create template" });
  }
});

templatesRouter.put("/:id", async (req, res) => {
  try {
    const auth = req.auth as AuthUser;
    const body = templateBodySchema.parse(req.body);
    const existing = await prisma.dnsTemplate.findFirst({
      where: { id: req.params.id, userId: auth.userId },
    });
    if (!existing) {
      return res.status(404).json({ detail: "Template not found" });
    }
    const template = await prisma.dnsTemplate.update({
      where: { id: req.params.id },
      data: {
        name: body.name,
        description: body.description,
        recordsJson: JSON.stringify(body.records),
      },
    });
    res.json(serializeTemplate(template));
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to update template" });
  }
});

templatesRouter.delete("/:id", async (req, res) => {
  try {
    const auth = req.auth as AuthUser;
    const existing = await prisma.dnsTemplate.findFirst({
      where: { id: req.params.id, userId: auth.userId },
    });
    if (!existing) {
      return res.status(404).json({ detail: "Template not found" });
    }
    await prisma.dnsTemplate.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to delete template" });
  }
});

// Create a template from an existing zone's DNS records
templatesRouter.post("/from-zone/:zoneId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const bodySchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  });
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const zone = await cloudflareService.getZoneDetails(credentials, req.params.zoneId);
    const records = await cloudflareService.listDnsRecords(credentials, req.params.zoneId);

    // Normalize: replace the zone name with {domain} placeholder.
    // Skip NS/SOA records — they are zone-managed and should not be copied across zones.
    const zoneNameRegex = new RegExp(zone.name.replace(/\./g, "\\."), "g");
    const templateRecords: TemplateRecord[] = records
      .filter((r) => r.type !== "NS" && r.type !== "SOA")
      .map((r) => ({
        type: r.type,
        name: r.name.replace(zoneNameRegex, "{domain}"),
        content: r.content.replace(zoneNameRegex, "{domain}"),
        ttl: r.ttl,
        proxied: r.proxied,
        priority: r.priority,
      }));

    const template = await prisma.dnsTemplate.create({
      data: {
        userId: auth.userId,
        name: body.name,
        description: body.description || `Tạo từ ${zone.name}`,
        recordsJson: JSON.stringify(templateRecords),
      },
    });
    res.status(201).json(serializeTemplate(template));
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to create template from zone" });
  }
});

// Apply a template to multiple zones (bulk job)
templatesRouter.post("/:id/apply", async (req, res) => {
  const auth = req.auth as AuthUser;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const bodySchema = z.object({
    zones: z
      .array(z.object({ zoneId: z.string().min(1), zoneName: z.string().min(1) }))
      .min(1),
    mode: z.enum(["skip", "overwrite"]),
  });
  try {
    const body = bodySchema.parse(req.body);
    const template = await prisma.dnsTemplate.findFirst({
      where: { id: req.params.id, userId: auth.userId },
    });
    if (!template) {
      return res.status(404).json({ detail: "Template not found" });
    }
    const templateRecords = JSON.parse(template.recordsJson) as TemplateRecord[];
    const credentials = await getCredentials(auth.userId, accountId, label);

    const job = createJob(
      "apply-template",
      auth.userId,
      body.zones.map((zone) => ({ key: zone.zoneId, label: zone.zoneName })),
      async (item) => {
        const zone = body.zones.find((zn) => zn.zoneId === item.key)!;
        const existing = await cloudflareService.listDnsRecords(credentials, zone.zoneId);
        const existingByKey = new Map<string, DnsRecord>(
          existing.map((r) => [`${r.type}:${r.name.toLowerCase()}`, r]),
        );

        let created = 0;
        let updated = 0;
        let skipped = 0;

        for (const templateRecord of templateRecords) {
          const record = resolveRecordForZone(templateRecord, zone.zoneName);
          const match = existingByKey.get(`${record.type}:${record.name.toLowerCase()}`);
          if (match) {
            if (body.mode === "skip") {
              skipped += 1;
              continue;
            }
            await cloudflareService.updateDnsRecord(credentials, zone.zoneId, match.id, {
              type: record.type,
              name: record.name,
              content: record.content,
              ttl: record.ttl ?? match.ttl,
              proxied: record.proxied ?? match.proxied,
              priority: record.priority,
            });
            updated += 1;
          } else {
            await cloudflareService.createDnsRecord(credentials, zone.zoneId, {
              type: record.type,
              name: record.name,
              content: record.content,
              ttl: record.ttl ?? 1,
              proxied: record.proxied,
              priority: record.priority,
            });
            created += 1;
          }
        }

        logger.info("Applied template to zone", {
          templateId: template.id,
          zoneId: zone.zoneId,
          created,
          updated,
          skipped,
        });
        return { created, updated, skipped };
      },
    );

    res.status(202).json({ jobId: job.id });
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to apply template" });
  }
});
