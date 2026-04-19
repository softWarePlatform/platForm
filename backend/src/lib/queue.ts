import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "./config.js";

let connection: IORedis | null = null;

function getConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
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
