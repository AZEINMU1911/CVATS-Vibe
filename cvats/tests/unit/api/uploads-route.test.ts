import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/uploads/route";

describe("POST /api/uploads", () => {
  it("returns 400 when body is missing", async () => {
    const request = new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=--test" },
      body: "--test--",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
