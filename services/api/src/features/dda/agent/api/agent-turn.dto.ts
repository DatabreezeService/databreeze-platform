import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AgentTurnRequestDtoV1 {
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
  @IsBoolean()
  public userConfirmation?: boolean;
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
}
