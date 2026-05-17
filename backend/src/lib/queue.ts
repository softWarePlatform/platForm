import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";

let connection: Redis | null = null;

function getConnection(): Redis {
  if (!connection) {
    connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  }
  return connection;
}

export function getJudgeQueue(): Queue {
  return new Queue(config.judgeQueueName, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 1500 },
      removeOnComplete: { age: 3600, count: 5000 },
      removeOnFail: { age: 86400 },
    },
  });
}
