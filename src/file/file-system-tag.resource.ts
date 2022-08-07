import { http } from "@deepkit/http";
import { Inject } from "@deepkit/injector";
import { Database, Query } from "@deepkit/orm";
import { rest } from "@deepkit-rest/rest-core";
import {
  ResponseReturnType,
  RestCrudKernel,
  RestSerializationCustomizations,
} from "@deepkit-rest/rest-crud";
import { RequestContext } from "src/core/request-context";
import { AppEntitySerializer, AppResource } from "src/core/rest";
import { InjectDatabaseSession } from "src/database-extension/database-tokens";
import { User } from "src/user/user.entity";

import { FileSystemTag } from "./file-system-tag.entity";

@rest.resource(FileSystemTag, "tags")
@http.group("auth-required")
export class FileSystemTagResource
  extends AppResource<FileSystemTag>
  implements RestSerializationCustomizations<FileSystemTag>
{
  readonly serializer = FileSystemTagSerializer;

  constructor(
    database: Database,
    private context: RequestContext,
    private databaseSession: InjectDatabaseSession,
    private crud: RestCrudKernel<FileSystemTag>,
  ) {
    super(database);
  }

  getQuery(): Query<FileSystemTag> {
    const userRef = this.database.getReference(User, this.context.user.id);
    return this.databaseSession.query(FileSystemTag).filter({ owner: userRef });
  }

  @rest.action("GET")
  @http.serialization({ groupsExclude: ["internal"] })
  async list(): Promise<ResponseReturnType> {
    return this.crud.list();
  }

  @rest.action("POST")
  @http.serialization({ groupsExclude: ["internal"] })
  async create(): Promise<ResponseReturnType> {
    return this.crud.create();
  }

  @rest.action("GET", ":pk")
  @http.serialization({ groupsExclude: ["internal"] })
  async retrieve(): Promise<ResponseReturnType> {
    return this.crud.retrieve();
  }

  @rest.action("PATCH", ":pk")
  @http.serialization({ groupsExclude: ["internal"] })
  async update(): Promise<ResponseReturnType> {
    return this.crud.update();
  }

  @rest.action("DELETE", ":pk")
  @http.serialization({ groupsExclude: ["internal"] })
  async delete(): Promise<ResponseReturnType> {
    return this.crud.delete();
  }
}

export class FileSystemTagSerializer extends AppEntitySerializer<FileSystemTag> {
  protected database!: InjectDatabaseSession;
  protected requestContext!: Inject<RequestContext>;
  protected override createEntity(data: Partial<FileSystemTag>): FileSystemTag {
    const userId = this.requestContext.user.id;
    data.owner = this.database.getReference(User, userId);
    return super.createEntity(data);
  }
}
