import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type ModuleCatalogEntryV1 } from '@databreeze/domain/module-catalog/v1';

import {
  CLIENT_COMPATIBILITY_PORT,
  type ClientCompatibilityPort,
  type ClientCompatibilityResult,
} from '../application/client-compatibility.port.js';
import { ModuleCatalogService } from '../application/module-catalog.service.js';
import { ClientCompatibilityDto } from './client-compatibility.dto.js';

@ApiTags('system')
@Controller('v1/system')
export class SystemController {
  constructor(
    @Inject(CLIENT_COMPATIBILITY_PORT)
    private readonly compatibility: ClientCompatibilityPort,
    private readonly moduleCatalog: ModuleCatalogService,
  ) {}

  @Get('modules')
  @ApiOperation({ summary: 'List the canonical DataBreeze product module catalog' })
  @ApiOkResponse({
    schema: {
      items: {
        additionalProperties: false,
        properties: {
          id: {
            enum: [
              'folder-autopilot',
              'spreadsheet-auditor',
              'quote-intelligence',
              'operations-capture',
              'invoice-leak-detector',
              'client-report-factory',
              'private-data-analyst',
              'migration-ready',
              'data-quality-guard',
              'embedded-importer',
            ],
            type: 'string',
          },
          lifecycle: { enum: ['partial', 'planned'], type: 'string' },
          platforms: {
            items: { enum: ['web', 'desktop', 'android'], type: 'string' },
            type: 'array',
          },
          requirementPrefix: { type: 'string' },
          title: {
            additionalProperties: false,
            properties: { en: { type: 'string' }, vi: { type: 'string' } },
            required: ['vi', 'en'],
            type: 'object',
          },
          workflowStages: { items: { type: 'string' }, type: 'array' },
        },
        required: ['id', 'requirementPrefix', 'lifecycle', 'title', 'platforms', 'workflowStages'],
        type: 'object',
      },
      type: 'array',
    },
  })
  getModules(): readonly ModuleCatalogEntryV1[] {
    return this.moduleCatalog.list();
  }

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
