import path from "node:path";

import { config } from "./config.js";

export function getInstanceAuthPath(instanceId: string) {
  return path.join(config.authDir, instanceId);
}
