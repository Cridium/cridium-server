import { HttpNotFoundError } from "@deepkit/http";
import { Query } from "@deepkit/orm";
import {
  HttpInjectorContext,
  NoContentResponse,
} from "src/http-extension/http-common";

import { RestActionContext } from "../core/rest-action";
import { RestResource } from "../core/rest-resource";
import { RestFilteringCustomizations } from "./rest-filtering";
import { RestPaginationCustomizations } from "./rest-pagination";
import {
  RestFieldBasedRetriever,
  RestRetrievingCustomizations,
} from "./rest-retrieving";
import {
  RestGenericSerializer,
  RestSerializationCustomizations,
} from "./rest-serialization";
import { RestSortingCustomizations } from "./rest-sorting";

export class RestCrudService {
  constructor(
    private injector: HttpInjectorContext,
    private context: RestActionContext,
  ) {}

  async list<Entity>(): Promise<RestList<Entity>> {
    const module = this.context.getModule();
    const resource: RestResource<Entity> &
      RestPaginationCustomizations &
      RestFilteringCustomizations &
      RestSortingCustomizations = this.context.getResource();

    let query = resource.query();

    if (resource.filters)
      query = resource.filters
        .map((type) => this.injector.resolve(module, type)())
        .reduce((query, filter) => filter.process(query), query);
    const total = await query.count();

    if (resource.sorters)
      query = resource.sorters
        .map((type) => this.injector.resolve(module, type)())
        .reduce((query, sorter) => sorter.process(query), query);
    if (resource.paginator)
      query = this.injector
        .resolve(module, resource.paginator)()
        .process(query);
    const items = await query.find();

    return { total, items };
  }

  // TODO: return 201
  async create<Entity>(): Promise<Entity> {
    const resource: RestResource<Entity> &
      RestSerializationCustomizations<Entity> = this.context.getResource();
    const module = this.context.getModule();
    const serializerType = resource.serializer ?? RestGenericSerializer;
    const serializer = this.injector.resolve(module, serializerType)();
    await this.context.loadRequestBody();
    const entity = await serializer.create(this.context.getRequestBody());
    const database = this.context.getResource().query()["session"]; // hack
    database.add(entity);
    await database.flush();
    return entity;
  }

  async update<Entity>(): Promise<Entity> {
    const resource: RestResource<Entity> &
      RestSerializationCustomizations<Entity> = this.context.getResource();
    const module = this.context.getModule();
    const serializerType = resource.serializer ?? RestGenericSerializer;
    const serializer = this.injector.resolve(module, serializerType)();
    await this.context.loadRequestBody();
    let entity = await this.retrieve<Entity>();
    entity = await serializer.update(entity, this.context.getRequestBody());
    const database = this.context.getResource().query()["session"]; // hack
    database.add(entity);
    await database.flush();
    return entity;
  }

  async retrieve<Entity>(): Promise<Entity> {
    if (!this.context.getActionMeta().detailed)
      throw new Error("Not a detailed action");
    const module = this.context.getModule();
    const resource: RestResource<Entity> & RestRetrievingCustomizations =
      this.context.getResource();
    const retrieverType = resource.retriever ?? RestFieldBasedRetriever;
    const retriever = this.injector.resolve(module, retrieverType)();
    const query = retriever.process(resource.query());
    const result = await query.findOneOrUndefined();
    if (!result) throw new HttpNotFoundError();
    return result;
  }

  async delete<Entity>(): Promise<NoContentResponse> {
    const entity = await this.retrieve<Entity>();
    const database = this.context.getResource().query()["session"]; // hack
    database.remove(entity);
    await database.flush();
    return new NoContentResponse();
  }
}

export interface RestQueryProcessor {
  process<Entity>(query: Query<Entity>): Query<Entity>;
}

export interface RestList<Entity> {
  total: number;
  items: Entity[];
}
