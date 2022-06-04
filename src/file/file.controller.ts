import {
  http,
  HttpBody,
  HttpNotFoundError,
  HttpQueries,
  HttpRequest,
  HttpResponse,
} from "@deepkit/http";
import { Maximum } from "@deepkit/type";
import { createHash } from "crypto";
import {
  HttpRangeNotSatisfiableError,
  NoContentResponse,
} from "src/common/http";
import { HttpRangeService } from "src/common/http-range.service";
import { RequestContext } from "src/core/request-context";
import { InjectDatabaseSession } from "src/database/database.tokens";
import { FileEngine } from "src/file-engine/file-engine.interface";
import { ResourceCrudHandler } from "src/resource/resource-crud-handler.service";
import { ResourceFilterMap } from "src/resource/resource-filter.typings";
import {
  ResourceList,
  ResourcePagination,
} from "src/resource/resource-listing.typings";
import { ResourceOrderMap } from "src/resource/resource-order.typings";
import { User } from "src/user/user.entity";
import { Readable } from "stream";

import { FileRecord } from "./file-record.entity";

@http.controller("files")
export class FileController {
  constructor(
    private db: InjectDatabaseSession,
    private context: RequestContext,
    private handler: ResourceCrudHandler<FileRecord>,
    private engine: FileEngine,
    private httpRangeService: HttpRangeService,
  ) {}

  @http
    .GET()
    .serialization({ groupsExclude: ["hidden"] })
    .group("protected")
  async list(
    { filter, order, ...pagination }: HttpQueries<FileRecordListParameters>, //
  ): Promise<ResourceList<FileRecord>> {
    return this.handler.list({ filter, order, pagination });
  }

  @http
    .POST()
    .serialization({ groupsExclude: ["hidden"] })
    .group("protected")
  async create(
    payload: HttpBody<FileRecordCreationPayload>,
  ): Promise<FileRecord> {
    const owner = this.db.getReference(User, this.context.user.id);
    const record = new FileRecord({ owner, ...payload });
    this.db.add(record);
    // temporary workaround: serialization result is different between manually
    // instantiated entities and queried entities, so we have to retrieve it
    // again from the database
    await this.db.flush();
    this.db.identityMap.clear();
    return this.handler.retrieve({ id: record.id });
  }

  @http
    .GET(":id")
    .serialization({ groupsExclude: ["hidden"] })
    .group("protected")
  async retrieve(id: FileRecord["id"]): Promise<FileRecord> {
    return this.handler.retrieve({ id });
  }

  @http
    .PATCH(":id")
    .serialization({ groupsExclude: ["hidden"] })
    .group("protected")
  async update(
    id: FileRecord["id"],
    payload: HttpBody<FileRecordUpdatePayload>,
  ): Promise<FileRecord> {
    const record = await this.handler.retrieve({ id });
    record.assign(payload);
    return record;
  }

  @http
    .DELETE(":id")
    .serialization({ groupsExclude: ["hidden"] })
    .group("protected")
  async delete(id: FileRecord["id"]): Promise<NoContentResponse> {
    const record = await this.handler.retrieve({ id });
    this.db.remove(record);
    return new NoContentResponse();
  }

  @http
    .PUT(":id/content")
    .serialization({ groupsExclude: ["hidden"] })
    .group("protected")
  async upload(
    id: FileRecord["id"],
    request: HttpRequest,
  ): Promise<NoContentResponse> {
    const record = await this.handler.retrieve({ id });
    const [key, integrity] = await Promise.all([
      this.engine.store(request),
      hash(request),
    ]);
    record.contentKey = key;
    record.contentIntegrity = integrity;
    return new NoContentResponse();
  }

  @http
    .GET(":id/content")
    .serialization({ groupsExclude: ["hidden"] })
    .group("protected")
  async download(
    id: FileRecord["id"],
    response: HttpResponse,
    request: HttpRequest,
  ): Promise<HttpResponse> {
    const record = await this.handler.retrieve({ id });
    if (!record.isContentDefined()) throw new HttpNotFoundError();

    if (request.headers["range"]) {
      const ranges = this.httpRangeService.parse(
        request.headers["range"],
        record.size,
      );

      // TODO: implement multiple chunks downloading
      if (ranges.length !== 1) throw new HttpRangeNotSatisfiableError();

      const stream = await this.engine.retrieve(record.contentKey, {
        start: ranges[0][0],
        end: ranges[0][1],
      });
      response.status(206);
      return stream.pipe(response);
    }
    const stream = await this.engine.retrieve(record.contentKey);
    return stream.pipe(response);
  }

  @http
    .GET(":id/integrity")
    .group("protected")
    .response(204, "File integrity verified")
    .response(404, "File broken or not uploaded")
  async verify(id: FileRecord["id"]): Promise<NoContentResponse> {
    const record = await this.handler.retrieve({ id });
    if (!record.isContentDefined()) throw new HttpNotFoundError();
    const stream = await this.engine.retrieve(record.contentKey);
    const integrity = await hash(stream);
    if (integrity !== record.contentIntegrity) throw new HttpNotFoundError();
    return new NoContentResponse();
  }
}

interface FileRecordListParameters {
  limit?: ResourcePagination["limit"] & Maximum<500>;
  offset?: ResourcePagination["offset"] & Maximum<500>;
  filter?: ResourceFilterMap<FileRecord>;
  order?: ResourceOrderMap<FileRecord>;
}

interface FileRecordCreationPayload {
  name: FileRecord["name"];
  path: FileRecord["path"];
  size: FileRecord["size"];
}

interface FileRecordUpdatePayload extends Partial<FileRecordCreationPayload> {}

// TODO: move to a proper module
export async function hash(source: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = source.pipe(createHash("md5"));
    stream.once("finish", () => resolve(stream.read().toString("hex")));
    stream.once("error", (err) => reject(err));
  });
}
