import { eventDispatcher } from "@deepkit/event";
import { UnitOfWorkEvent } from "@deepkit/orm";
import {
  Email,
  entity,
  Group,
  MaxLength,
  MinLength,
  Unique,
} from "@deepkit/type";
import { compare, hash } from "bcryptjs";
import { DATABASE_PRE_INSERT } from "src/database/database-event";
import { Entity } from "src/shared/entity";

@entity.name("user")
export class User extends Entity {
  name!: string & MinLength<1> & MaxLength<20>;
  email!: Email & Unique;
  password!: string & MinLength<6> & MaxLength<50> & Group<"hidden">;

  async hashPassword(): Promise<void> {
    const hashed = this.password.length === 60;
    if (hashed) return;
    this.password = await hash(this.password, 10);
  }

  async verify(password: string): Promise<boolean> {
    return compare(password, this.password);
  }
}

export class UserEventListener {
  @eventDispatcher.listen(DATABASE_PRE_INSERT)
  async preInsert(event: UnitOfWorkEvent<User>): Promise<void> {
    if (event.classSchema.getClassType() !== User) return;
    await Promise.all(event.items.map((user) => user.hashPassword()));
  }
}
