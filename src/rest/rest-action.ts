import { ClassType } from "@deepkit/core";
import {
  http,
  HttpNotFoundError,
  HttpRequest,
  RouteParameterResolver,
  RouteParameterResolverContext,
} from "@deepkit/http";
import { InjectorContext, InjectorModule } from "@deepkit/injector";
import {
  deserialize,
  InlineRuntimeType,
  ReflectionClass,
  validate,
  ValidationError,
} from "@deepkit/type";

import { restClass } from "./rest.decorator";
import {
  RestActionMetaValidated,
  RestResourceMetaValidated,
} from "./rest.meta";
import { RestQuery } from "./rest.query";

export class RestActionRouteParameterResolver
  implements RouteParameterResolver
{
  constructor(private lookupResolver: RestActionLookupResolver) {}

  setupAction(actionMeta: RestActionMetaValidated): void {
    const resourceMeta = actionMeta.resource.validate();
    const resolver = this.constructor as ClassType;
    const args = [resourceMeta.classType.prototype, actionMeta.name] as const;
    http.resolveParameter(RestActionContext, resolver)(...args);
    if (actionMeta.detailed) {
      http.resolveParameterByName("lookup", resolver)(...args);
      http.resolveParameterByName("target", resolver)(...args);
    }
  }

  async resolve(context: RouteParameterResolverContext): Promise<unknown> {
    context.route = (context as any).routeConfig; // temporary workaround

    const actionContext = await RestActionContext.build(context);

    if (context.token === RestActionContext) return actionContext;

    if (context.name === "lookup")
      return this.lookupResolver.resolveValue(actionContext);
    if (context.name === "target")
      return this.lookupResolver.resolveResult(actionContext);

    throw new Error(`Unsupported parameter name ${context.name}`);
  }
}

export class RestActionLookupResolver {
  constructor(private injector: InjectorContext) {}

  async resolveValue(context: RestActionContext): Promise<unknown> {
    const { parameters, resourceMeta, actionMeta } = context;
    const entitySchema = ReflectionClass.from(resourceMeta.entityType);

    if (!actionMeta.detailed)
      throw new Error("Cannot resolve lookup value for non-detailed actions");

    const lookupField = this.getField(resourceMeta, entitySchema);
    const lookupType = entitySchema.getProperty(lookupField).type;
    type LookupType = InlineRuntimeType<typeof lookupType>;

    let lookupValue = parameters[lookupField];
    lookupValue = deserialize<LookupType>(lookupValue);
    const validationErrors = validate<LookupType>(lookupValue);
    if (validationErrors.length) throw new ValidationError(validationErrors);

    return lookupValue;
  }

  async resolveResult(context: RestActionContext): Promise<unknown> {
    const { module, resourceMeta, actionMeta } = context;
    const entitySchema = ReflectionClass.from(resourceMeta.entityType);

    if (!actionMeta.detailed)
      throw new Error("Cannot resolve lookup result for non-detailed actions");

    const resource = this.injector.get(resourceMeta.classType, module);
    const lookupField = this.getField(resourceMeta, entitySchema);
    const lookupValue = await this.resolveValue(context);
    const lookupResult = await resource
      .query()
      .lift(RestQuery)
      .filterAppend({ [lookupField]: lookupValue })
      .findOneOrUndefined();

    if (!lookupResult) throw new HttpNotFoundError();
    return lookupResult;
  }

  private getField(
    resourceMeta: RestResourceMetaValidated,
    entitySchema: ReflectionClass<any>,
  ) {
    const lookupField = resourceMeta.lookup;
    if (!lookupField) throw new Error("Lookup field not specified");
    if (!entitySchema.hasProperty(lookupField))
      throw new Error("Lookup field does not exist");
    return lookupField;
  }
}

export class RestActionContext {
  static async build(
    context: RouteParameterResolverContext,
  ): Promise<RestActionContext> {
    const { controller: resourceType, module } = context.route.action;
    if (!module) throw new Error("Module not defined");

    const resourceMeta = restClass._fetch(resourceType)?.validate();
    if (!resourceMeta)
      throw new Error(`Cannot resolve parameters for non-resource controllers`);

    const actionName = context.route.action.methodName;
    const actionMeta = resourceMeta.actions[actionName].validate();
    if (!actionMeta)
      throw new Error(`Cannot resolve parameters for non-action routes`);

    return new RestActionContext({
      request: context.request,
      parameters: context.parameters,
      module,
      resourceMeta,
      actionMeta,
    });
  }

  request!: HttpRequest;
  parameters!: Record<string, unknown>;
  module!: InjectorModule;
  resourceMeta!: RestResourceMetaValidated;
  actionMeta!: RestActionMetaValidated;

  private constructor(data: RestActionContext) {
    Object.assign(this, data);
  }
}