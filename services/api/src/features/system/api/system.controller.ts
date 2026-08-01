import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CLIENT_COMPATIBILITY_PORT,
  type ClientCompatibilityPort,
  type ClientCompatibilityResult,
} from '../application/client-compatibility.port.js';
import { ClientCompatibilityDto } from './client-compatibility.dto.js';

@ApiTags('system')
@Controller('v1/system')
export class SystemController {
  constructor(
    @Inject(CLIENT_COMPATIBILITY_PORT)
    private readonly compatibility: ClientCompatibilityPort,
  ) {}

  @Get('compatibility')
  @ApiOperation({ summary: 'Check compatibility for a released DataBreeze client' })
  @ApiOkResponse({
    schema: {
      additionalProperties: false,
      properties: {
        apiMajorVersion: { enum: [1], type: 'integer' },
        status: { enum: ['supported'], type: 'string' },
      },
      required: ['apiMajorVersion', 'status'],
      type: 'object',
    },
  })
  async getCompatibility(
    @Query() input: ClientCompatibilityDto,
  ): Promise<ClientCompatibilityResult> {
    return this.compatibility.check(input);
  }

  @Post('compatibility/check')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check compatibility using a structured request body' })
  @ApiBody({ type: ClientCompatibilityDto })
  @ApiOkResponse({
    schema: {
      additionalProperties: false,
      properties: {
        apiMajorVersion: { enum: [1], type: 'integer' },
        status: { enum: ['supported'], type: 'string' },
      },
      required: ['apiMajorVersion', 'status'],
      type: 'object',
    },
  })
  async checkCompatibility(
    @Body() input: ClientCompatibilityDto,
  ): Promise<ClientCompatibilityResult> {
    return this.compatibility.check(input);
  }
}
