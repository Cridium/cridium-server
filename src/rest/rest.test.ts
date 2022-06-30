import { App } from "@deepkit/app";
import { ClassType } from "@deepkit/core";
import { createTestingApp, TestingFacade } from "@deepkit/framework";
import {
  http,
  HttpAction,
  httpClass,
  HttpKernel,
  HttpRequest,
  RouteConfig,
  Router,
} from "@deepkit/http";
import { Inject, InjectorContext, ProviderWithScope } from "@deepkit/injector";
import { Logger, MemoryLoggerTransport } from "@deepkit/logger";
import * as orm from "@deepkit/orm"; // temporary workaround: we have to use namespace import here as a temporary workaround, otherwise the application will not be able to bootstrap. This will be fixed in the next release
import { AutoIncrement, entity, PrimaryKey } from "@deepkit/type";
import { HttpExtensionModule } from "src/http-extension/http-extension.module";

import { RestConfig } from "./rest.config";
import { rest, restClass } from "./rest.decorator";
import { RestActionMeta, RestMetaConfigurator } from "./rest.meta";
import { RestModule } from "./rest.module";
import { RestActionContext } from "./rest-action";
import { RestLookupResolver } from "./rest-lookup";
import { RestResource } from "./rest-resource";

describe("REST", () => {
  let facade: TestingFacade<App<any>>;
  let requester: HttpKernel;
  let database: orm.Database;

  async function setup(
    config: Partial<RestConfig>,
    controllers: ClassType<RestResource<any>>[],
    providers: ProviderWithScope[] = [],
  ) {
    facade = createTestingApp({
      imports: [new HttpExtensionModule(), new RestModule(config)],
      controllers,
      providers: [
        {
          provide: "DATABASE",
          useValue: new orm.Database(new orm.MemoryDatabaseAdapter()),
        },
        ...providers,
      ],
    });
    requester = facade.app.get(HttpKernel);
    database = facade.app.get(InjectorContext).get<orm.Database>("DATABASE");
    await database.migrate();
    // temporary workaround: transport setup is not working, so we have to
    // manually set it up
    facade.app.get(Logger).setTransport([new MemoryLoggerTransport()]);
    await facade.startServer();
  }

  @entity.name("user").collection("users")
  class User {
    id: number & PrimaryKey & AutoIncrement = 0;
  }

  class UserRestResource implements RestResource<User> {
    constructor(private database: Inject<orm.Database, "DATABASE">) {}
    query(): orm.Query<User> {
      return this.database.query(User);
    }
  }

  test("routing (inferred from entity collection name)", async () => {
    @rest.resource(User).lookup("id")
    class TestingResource extends UserRestResource {
      @rest.action("POST")
      route1() {}
      @rest.action("GET").detailed()
      route2() {}
      @rest.action("DELETE").path("suffix")
      route3() {}
      @rest.action("PATCH").detailed().path("suffix")
      route4() {}
    }
    await setup({ prefix: "prefix", versioning: false }, [TestingResource]);
    const routes = facade.app.get(Router).getRoutes();
    expect(routes).toMatchObject<Partial<RouteConfig>[]>([
      { baseUrl: "prefix/users", path: "", httpMethods: ["POST"] },
      { baseUrl: "prefix/users", path: ":id", httpMethods: ["GET"] },
      { baseUrl: "prefix/users", path: "suffix", httpMethods: ["DELETE"] },
      { baseUrl: "prefix/users", path: ":id/suffix", httpMethods: ["PATCH"] },
    ]);
  });

  test("routing (explicitly specified)", async () => {
    @rest.resource(User, "name").lookup("id")
    class TestingResource extends UserRestResource {
      @rest.action("GET")
      route1() {}
    }
    await setup({ prefix: "prefix", versioning: false }, [TestingResource]);
    const routes = facade.app.get(Router).getRoutes();
    expect(routes).toMatchObject<Partial<RouteConfig>[]>([
      { baseUrl: "prefix/name", path: "", httpMethods: ["GET"] },
    ]);
  });

  test("routing (versioning)", async () => {
    @rest.resource(User, "name").lookup("id").version(1)
    class TestingResourceV1 extends UserRestResource {
      @rest.action("GET")
      route1() {}
    }
    @rest.resource(User, "name").lookup("id").version(2)
    class TestingResourceV2 extends UserRestResource {
      @rest.action("POST")
      route1() {}
    }
    await setup({ prefix: "prefix", versioning: "v" }, [
      TestingResourceV1,
      TestingResourceV2,
    ]);
    const routes = facade.app.get(Router).getRoutes();
    expect(routes).toMatchObject<Partial<RouteConfig>[]>([
      { baseUrl: "prefix/v1/name", path: "", httpMethods: ["GET"] },
      { baseUrl: "prefix/v2/name", path: "", httpMethods: ["POST"] },
    ]);
  });

  test("parameter resolving", async () => {
    let lookup1!: User["id"];
    let target1!: User;
    let context1!: RestActionContext;
    let request1!: HttpRequest;

    @rest.resource(User).lookup("id")
    class TestingResource extends UserRestResource {
      @rest.action("GET").detailed()
      retrieve(
        lookup: User["id"],
        target: User,
        context: RestActionContext,
        request: HttpRequest,
      ) {
        lookup1 = lookup;
        target1 = target;
        context1 = context;
        request1 = request;
      }
    }
    await setup({ prefix: "prefix", versioning: false }, [TestingResource]);
    await database.persist(new User());
    const response = await requester.request(
      HttpRequest.GET("/prefix/users/1"),
    );
    expect(response.statusCode).toBe(200);
    expect(target1).toBeInstanceOf(User);
    expect(lookup1).toBe(target1.id);
    expect(context1).toBeInstanceOf(RestActionContext);
    expect(request1).toBeDefined();
  });

  test("parameter resolving (custom lookup resolver)", async () => {
    let assert!: () => void;
    class MyLookupResolver implements RestLookupResolver {
      async resolveValue(): Promise<unknown> {
        return 1;
      }
      async resolveResult(): Promise<unknown> {
        return 2;
      }
    }
    @rest.resource(User).lookup("id", MyLookupResolver)
    class MyResource extends UserRestResource {
      @rest.action("GET").detailed()
      action(lookup: unknown, target: unknown) {
        assert = () => {
          expect(lookup).toBe(1);
          expect(target).toBe(2);
        };
      }
    }
    await setup(
      { prefix: "prefix", versioning: false },
      [MyResource],
      [MyLookupResolver],
    );
    const response = await requester.request(
      HttpRequest.GET("/prefix/users/1"),
    );
    expect(response.statusCode).toBe(200);
    assert();
  });

  test("meta configurator", async () => {
    class MyConfigurator implements RestMetaConfigurator<RestActionMeta> {
      configure(meta: RestActionMeta): void {
        meta.path = "v2";
      }
    }
    @rest.resource(User)
    class MyResource extends UserRestResource {
      @rest.action("GET").useConfigurator(new MyConfigurator()).path("v1")
      action() {}
    }
    expect(restClass._fetch(MyResource)?.actions?.["action"].path).toBe("v1");
    await setup({ prefix: "prefix", versioning: false }, [MyResource]);
    expect(restClass._fetch(MyResource)?.actions?.["action"].path).toBe("v2");
  });

  test("compatibility with @http", async () => {
    @rest.resource(User)
    class MyResource extends UserRestResource {
      @rest.action("GET")
      @http.group("test")
      action() {}
    }
    await setup({ prefix: "prefix", versioning: false }, [MyResource as any]);
    const actions = httpClass._fetch(MyResource)?.actions;
    const meta: HttpAction = actions?.values().next().value;
    expect(meta?.httpMethods).toEqual(["GET"]);
    expect(meta?.groups).toEqual(["test"]);
  });

  test("http scope injection", async () => {
    @rest.resource(User)
    class MyResource extends UserRestResource {
      constructor(
        private dep: Dep,
        database: Inject<orm.Database, "DATABASE">,
      ) {
        super(database);
      }

      @rest.action("GET")
      route() {}
    }
    class Dep {}
    const promise = setup(
      { prefix: "prefix", versioning: false },
      [MyResource as any],
      [{ provide: Dep, scope: "http" }],
    );
    await expect(promise).resolves.toBeUndefined();
    await requester.request(HttpRequest.GET("/prefix/users"));
  });
});
