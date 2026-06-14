import { ProcessingJobStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import type { EnqueueJobInput, JobQueue } from "@/lib/queue/job-queue";

export class PostgresJobQueue implements JobQueue {
  enqueue(
    input: EnqueueJobInput,
    transaction: Prisma.TransactionClient | typeof prisma = prisma,
  ) {
    return transaction.processingJob.create({
      data: {
        type: input.type,
        fileId: input.fileId,
        payload: input.payload,
        maxAttempts: input.maxAttempts ?? 5,
      },
    });
  }

  async retry(jobId: string, error: string, delaySeconds = 60) {
    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId } });
    const attempts = job.attempts + 1;
    if (attempts >= job.maxAttempts) return this.deadLetter(jobId, error);

    return prisma.processingJob.update({
      where: { id: jobId },
      data: {
        attempts,
        status: ProcessingJobStatus.RETRY_SCHEDULED,
        availableAt: new Date(Date.now() + delaySeconds * 1000),
        lockedAt: null,
        lastError: error,
      },
    });
  }

  deadLetter(jobId: string, error: string) {
    return prisma.processingJob.update({
      where: { id: jobId },
      data: {
        status: ProcessingJobStatus.DEAD_LETTER,
        deadLetteredAt: new Date(),
        lockedAt: null,
        lastError: error,
      },
    });
  }
}

export const jobQueue = new PostgresJobQueue();
