import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  IAM_HIERARCHY_SERVICE,
  type IamHierarchyService,
} from '../application/hierarchy.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import { CreateProjectDto, CreateWorkspaceDto } from './hierarchy.dto.js';

/** IAM-001, IAM-003, IAM-019: content-free tenant hierarchy administration. */
@ApiTags('identity')
@ApiBearerAuth()
@Controller('v1')
export class IamHierarchyController {
  public constructor(
    @Inject(IAM_HIERARCHY_SERVICE) private readonly hierarchy: IamHierarchyService,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Get('organizations/:organizationId')
  @ApiOperation({ summary: 'Read one organization inside the authenticated tenant scope' })
  @ApiOkResponse({ description: 'The organization metadata.' })
  @ApiNotFoundResponse({ description: 'The organization is not visible.' })
  async getOrganization(
    @Req() request: unknown,
    @Param('organizationId') organizationId: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.hierarchy.getOrganization(context, organizationId);
  }

  @Get('organizations/:organizationId/workspaces')
  @ApiOperation({ summary: 'List workspaces in the authenticated organization scope' })
  @ApiOkResponse({ description: 'The content-free workspace list.' })
  async listWorkspaces(
    @Req() request: unknown,
    @Param('organizationId') organizationId: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.hierarchy.listWorkspaces(context, organizationId);
  }

  @Post('organizations/:organizationId/workspaces')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create an immutable workspace in the authenticated organization' })
  @ApiBody({ type: CreateWorkspaceDto })
  async createWorkspace(
    @Req() request: unknown,
    @Param('organizationId') organizationId: string,
    @Body() input: CreateWorkspaceDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.hierarchy.createWorkspace(context, organizationId, input.name);
  }

  @Get('workspaces/:workspaceId')
  @ApiOperation({ summary: 'Read one workspace inside the authenticated tenant scope' })
  @ApiOkResponse({ description: 'The workspace metadata.' })
  @ApiNotFoundResponse({ description: 'The workspace is not visible.' })
  async getWorkspace(@Req() request: unknown, @Param('workspaceId') workspaceId: string) {
    const context = await this.requestContext.resolve(request);
    return this.hierarchy.getWorkspace(context, workspaceId);
  }

  @Get('workspaces/:workspaceId/projects')
  @ApiOperation({ summary: 'List projects in the authenticated workspace scope' })
  @ApiOkResponse({ description: 'The content-free project list.' })
  async listProjects(@Req() request: unknown, @Param('workspaceId') workspaceId: string) {
    const context = await this.requestContext.resolve(request);
    return this.hierarchy.listProjects(context, workspaceId);
  }

  @Post('workspaces/:workspaceId/projects')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create an immutable project in the authenticated workspace' })
  @ApiBody({ type: CreateProjectDto })
  async createProject(
    @Req() request: unknown,
    @Param('workspaceId') workspaceId: string,
    @Body() input: CreateProjectDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.hierarchy.createProject(context, workspaceId, input.kind, input.name);
  }

  @Get('projects/:projectId')
  @ApiOperation({ summary: 'Read one project inside the authenticated tenant scope' })
  @ApiOkResponse({ description: 'The project metadata.' })
  @ApiNotFoundResponse({ description: 'The project is not visible.' })
  async getProject(@Req() request: unknown, @Param('projectId') projectId: string) {
    const context = await this.requestContext.resolve(request);
    return this.hierarchy.getProject(context, projectId);
  }
}
