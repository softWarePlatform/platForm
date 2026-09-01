import "dotenv/config";
import { buildApp } from "./app.js";
import { startJudgeDispatcher } from "../../backend/src/lib/judge-dispatcher.js";

const port = Number(process.env.PORT ?? 3001);

const app = await buildApp();
const stopJudgeDispatcher = startJudgeDispatcher({
  onResult: (result) => app.log.info(result, "pending judge submissions dispatched"),
  onError: (error) => app.log.error(error, "pending judge dispatch failed"),
});
app.addHook("onClose", async () => stopJudgeDispatcher());

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
