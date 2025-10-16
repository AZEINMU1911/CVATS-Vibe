import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireEnv } from "@/server/env";

const VARIABLES = ["ENV_ONE", "ENV_TWO"] as const;

const setNodeEnv = (value: string | undefined) => {
  const env = process.env as Record<string, string | undefined>;
  if (typeof value === "string") {
    env.NODE_ENV = value;
  } else {
    delete env.NODE_ENV;
  }
};

describe("requireEnv", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    setNodeEnv("production");
    for (const variable of VARIABLES) {
      delete process.env[variable];
    }
  });

  afterEach(() => {
    setNodeEnv(originalNodeEnv);
    for (const variable of VARIABLES) {
      delete process.env[variable];
    }
  });

  it("throws with a descriptive message when variables are missing", () => {
    expect(() => requireEnv([...VARIABLES])).toThrowError(
      new Error("Missing required environment variables: ENV_ONE, ENV_TWO"),
    );
  });

  it("does not throw when all variables are defined", () => {
    for (const variable of VARIABLES) {
      process.env[variable] = "configured";
    }

    expect(() => requireEnv([...VARIABLES])).not.toThrow();
  });
});
