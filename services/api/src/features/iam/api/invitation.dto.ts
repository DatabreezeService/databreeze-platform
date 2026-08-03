import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class IssueInvitationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  membershipId!: string;

  @ApiProperty({ format: 'email', maxLength: 254 })
  @IsEmail()
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  recipientEmail!: string;
}

export class AcceptInvitationDto {
  @ApiProperty({ minLength: 32, maxLength: 512, writeOnly: true })
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  token!: string;
}

export class InvitationRejectedResponseDto {
  @ApiProperty({ enum: [false], example: false })
  accepted!: false;

  @ApiProperty({
    enum: [
      'INVITATION_REQUEST_REJECTED',
      'INVITATION_SCOPE_DENIED',
      'INVITATION_NOT_FOUND',
      'INVITATION_CONFLICT',
      'INVITATION_DELIVERY_UNAVAILABLE',
      'INVITATION_UNAVAILABLE',
    ],
  })
  code!: string;
}
