import {
  ReflectionClass,
  ReflectionKind,
  ReflectionProperty,
} from "@deepkit/type";
import { ReflectionClassAddPropertyOptions } from "src/common/type";

import { RestQueryModelFactory } from "./rest-query-model";

describe("RestQueryModelFactory", () => {
  class TestingFactory extends RestQueryModelFactory {
    protected selectFields(
      entitySchema: ReflectionClass<any>,
    ): ReflectionProperty[] {
      return entitySchema.getProperties();
    }

    protected processField(
      entitySchema: ReflectionClass<any>,
      fieldSchema: ReflectionProperty,
    ): ReflectionClassAddPropertyOptions {
      const { name, type } = fieldSchema.property;
      return { name, type, optional: true };
    }
  }

  let factory: RestQueryModelFactory;

  beforeEach(() => {
    factory = new TestingFactory();
  });

  it("should work", () => {
    class E {
      id!: number;
      name!: string;
    }
    const s = factory.build<E>();
    expect(s.getPropertyNames()).toEqual(["id", "name"]);
    expect(s.getProperty("id").property).toMatchObject({
      type: { kind: ReflectionKind.number },
      optional: true,
    });
    expect(s.getProperty("name").property).toMatchObject({
      type: { kind: ReflectionKind.string },
      optional: true,
    });
  });
});