import { Database, Query } from "@deepkit/orm";
import { RestResource } from "src/rest/core/rest-resource";
import {
  RestFilteringCustomizations,
  RestGenericFilter,
  RestGenericSorter,
} from "src/rest/crud/rest-filtering";
import {
  RestOffsetLimitPaginator,
  RestPaginationCustomizations,
} from "src/rest/crud/rest-pagination";
import { RestGenericSerializer } from "src/rest/crud/rest-serialization";

import { AppEntity, isAppEntityType } from "./entity";

export abstract class AppResource<Entity extends AppEntity<Entity>>
  implements
    RestResource<Entity>,
    RestPaginationCustomizations,
    RestFilteringCustomizations
{
  readonly paginator = RestOffsetLimitPaginator;
  readonly filters = [RestGenericFilter, RestGenericSorter];

  constructor(protected database: Database) {}

  getDatabase(): Database {
    return this.database;
  }

  abstract getQuery(): Query<Entity>;
}

export abstract class AppEntitySerializer<
  Entity extends AppEntity<Entity>,
> extends RestGenericSerializer<Entity> {
  protected override createEntity(data: Partial<Entity>): Entity {
    const entityType = this.context.getEntitySchema().getClassType();
    if (!isAppEntityType(entityType)) throw new Error("Invalid entity class");
    return new entityType(data) as Entity;
  }

  protected override updateEntity(
    entity: Entity,
    data: Partial<Entity>,
  ): Entity {
    return entity.assign(data);
  }
}
