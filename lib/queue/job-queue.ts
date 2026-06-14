import type { ProcessingJob, ProcessingJobType, Prisma } from "@prisma/client";

export type EnqueueJobInput = {
  type: ProcessingJobType;
  fileId?: string;
  payload: Prisma.InputJsonValue;
  maxAttempts?: number;
};

export interface JobQueue {
  enqueue(input: EnqueueJobInput, transaction?: Prisma.TransactionClient): Promise<ProcessingJob>;
  retry(jobId: string, error: string, delaySeconds?: number): Promise<ProcessingJob>;
  deadLetter(jobId: string, error: string): Promise<ProcessingJob>;
}

