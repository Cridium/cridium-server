import {
  BackReference,
  Email,
  entity,
  Group,
  MaxLength,
  MinLength,
  Unique,
} from "@deepkit/type";
import {
  Filterable,
  InCreation,
  InUpdate,
  Orderable,
} from "@deepkit-rest/rest-crud";
import { compare, hash } from "bcryptjs";
import { AppEntity } from "src/core/entity";
import { FileSystemRecord } from "src/file/file-system-record.entity";

const HASH_LENGTH = 60;

// prettier-ignore
@entity.name("user").collection("users")
export class User extends AppEntity<User> {
  name!: string & MinLength<1> & MaxLength<20> & Filterable & Orderable & InCreation & InUpdate;
  email!: Email & Unique & Filterable & Orderable & InCreation & InUpdate;
  password!: string & MinLength<6> & MaxLength<typeof HASH_LENGTH> & InCreation & InUpdate & Group<"internal">;
  files: FileSystemRecord[] & BackReference & Group<"internal"> = [];
  verifiedAt?: Date = undefined;

  constructor(input: Pick<User, "name" | "email" | "password">) {
    super()
    this.assign(input)
  }

  async hashPassword(): Promise<void> {
    const hashed = this.password.length === HASH_LENGTH;
    if (hashed) return;
    this.password = await hash(this.password, 10);
  }

  async verify(password: string): Promise<boolean> {
    return compare(password, this.password);
  }
}
