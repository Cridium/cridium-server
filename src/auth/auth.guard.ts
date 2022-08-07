import { HttpRequest, HttpUnauthorizedError } from "@deepkit/http";
import { rest, RestGuard } from "@deepkit-rest/rest-core";
import { RequestContext } from "src/core/request-context";

import { AuthTokenService } from "./auth-token.service";

@rest.guard("auth-required")
export class AuthGuard implements RestGuard {
  constructor(
    private request: HttpRequest,
    private tokenService: AuthTokenService,
    private requestContext: RequestContext,
  ) {}

  async guard(): Promise<void> {
    const authorization = this.request.headers["authorization"];
    if (!authorization) throw new HttpUnauthorizedError();
    const match = authorization.match(/^Bearer (?<token>.*)$/u);
    const token = match?.groups?.["token"];
    if (!token) throw new HttpUnauthorizedError();
    const payload = await this.tokenService
      .decodeAndVerify(token)
      .catch(() => null);
    if (payload?.type !== "access") throw new HttpUnauthorizedError();

    this.requestContext.user = payload.user;
  }
}
