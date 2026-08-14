import {
  Equals,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AgentTurnRequestDtoV1 {
  @Equals(4)
  public schemaVersion!: 4;

  @IsUUID()
  public conversationId!: string;

  @IsUUID()
  public messageId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8_000)
  public text!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  public idempotencyKey!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(16)
  public locale!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  public contextRevision?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  public expectedContextRevision?: number;
}

export class AgentDeterministicToolRequestDtoV1 {
  @IsUUID()
  public conversationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  public toolName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  public idempotencyKey!: string;

  @IsObject()
  public input!: Readonly<Record<string, unknown>>;
}
