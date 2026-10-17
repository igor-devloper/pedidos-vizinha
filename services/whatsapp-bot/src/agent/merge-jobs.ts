import type { InboundMessageJob } from "../types.js";

/** Junta uma rajada de mensagens do mesmo cliente em um único "job" para o agente. */
export function mergeInboundJobs(jobs: InboundMessageJob[]): InboundMessageJob {
  if (jobs.length === 1) return jobs[0];

  const last = jobs[jobs.length - 1];
  const lastWithMedia = [...jobs].reverse().find((job) => job.mediaKind);
  const text = jobs
    .map((job) => job.text.trim())
    .filter(Boolean)
    .join("\n");

  return {
    ...last,
    text,
    originalText: jobs
      .map((job) => job.originalText?.trim())
      .filter(Boolean)
      .join("\n") || undefined,
    pushName: [...jobs].reverse().find((job) => job.pushName)?.pushName,
    phoneNumber: [...jobs].reverse().find((job) => job.phoneNumber)?.phoneNumber,
    mediaKind: lastWithMedia?.mediaKind,
    mediaMimeType: lastWithMedia?.mediaMimeType,
    // O conteúdo da mídia já virou texto; não carregamos o arquivo adiante.
    mediaBase64: undefined,
  };
}
