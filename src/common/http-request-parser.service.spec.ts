import { HttpRequest } from "@deepkit/http";

import { HttpRequestParser } from "./http-request-parser.service";

describe("HttpRequestParser", () => {
  let parser: HttpRequestParser;

  beforeEach(() => {
    parser = new HttpRequestParser();
  });

  describe("parseUrl", () => {
    it("should work", async () => {
      const { path, queries: params } = parser.parseUrl(
        "/url?array[]=value1&array[]=value2&object[key]=value",
      );
      expect(path).toBe("/url");
      expect(params).toEqual({
        array: ["value1", "value2"],
        object: { key: "value" },
      });
    });
  });

  describe("parseBody", () => {
    it("should work", async () => {
      const request = HttpRequest.POST("/").json({ a: 1 }).build();
      const body = await parser.parseBody(request);
      expect(body).toEqual({ a: 1 });
    });
  });
});