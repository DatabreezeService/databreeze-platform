import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { parseV4Contract, type IamWorkspaceCreateCommand } from '@databreeze/contracts/v4';

import {
  IAM_HIERARCHY_SERVICE,
  type IamHierarchyService,
  type IamHierarchyApplicationCodeV1,
} from '../application/hierarchy.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import {
  CreateProjectDto,
  CreateWorkspaceAcceptedDto,
  CreateWorkspaceDto,
} from './hierarchy.dto.js';
import type { FastifyReply } from 'fastify';

const WORKSPACE_CREATE_COMMAND_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/iam-workspace-create-command' as const;
const WORKSPACE_CREATE_ACCEPTED_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/iam-workspace-create-accepted' as const;

type HierarchyResult = { readonly accepted: boolean; readonly code?: string };

function hierarchyProblem(code: IamHierarchyApplicationCodeV1): HttpException {
  const status =
    code === 'SCOPE_DENIED'
      ? HttpStatus.FORBIDDEN
      : code === 'NOT_FOUND'
        ? HttpStatus.NOT_FOUND
        : code === 'CONFLICT'
          ? HttpStatus.CONFLICT
          : code === 'UNAVAILABLE'
            ? HttpStatus.SERVICE_UNAVAILABLE
            : HttpStatus.BAD_REQUEST;
  return new HttpException({ code: `IAM_HIERARCHY_${code}` }, status);
}

function preserveNotFoundStatus<TValue extends HierarchyResult>(
  result: TValue,
  reply?: FastifyReply,
): TValue {
  if (!result.accepted && result.code === 'NOT_FOUND') reply?.code(HttpStatus.NOT_FOUND);
  return result;
}

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
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return preserveNotFoundStatus(
      await this.hierarchy.getOrganization(context, organizationId),
      reply,
    );
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
  @ApiOkResponse({ type: CreateWorkspaceAcceptedDto })
  async createWorkspace(
    @Req() request: unknown,
    @Param('organizationId') organizationId: string,
    @Body() input: CreateWorkspaceDto,
  ): Promise<unknown> {
    const parsedCommand = parseV4Contract<IamWorkspaceCreateCommand>(
      WORKSPACE_CREATE_COMMAND_SCHEMA,
      input,
    );
    if (!parsedCommand.accepted)
      throw new HttpException({ code: 'IAM_HIERARCHY_INVALID_COMMAND' }, HttpStatus.BAD_REQUEST);
    const context = await this.requestContext.resolve(request);
    const result = await this.hierarchy.createWorkspace(
      context,
      organizationId,
      parsedCommand.value.name,
    );
    if (!result.accepted) return hierarchyProblem(result.code);
    const response = {
      schemaVersion: 4 as const,
      workspace: {
        id: result.value.workspace.id,
        organizationId: result.value.workspace.organizationId,
        name: result.value.workspace.name,
        status: result.value.workspace.status,
        dataMode: result.value.dataMode,
        createdAt: result.value.workspace.createdAt,
      },
      defaultProject: {
        id: result.value.defaultProject.id,
        kind: result.value.defaultProject.kind,
        name: result.value.defaultProject.name,
      },
    };
    const parsedResponse = parseV4Contract(WORKSPACE_CREATE_ACCEPTED_SCHEMA, response);
    if (!parsedResponse.accepted)
      throw new HttpException({ code: 'IAM_HIERARCHY_INVALID_RESPONSE' }, HttpStatus.BAD_REQUEST);
    return parsedResponse.value;
  }

  @Get('workspaces/:workspaceId')
  @ApiOperation({ summary: 'Read one workspace inside the authenticated tenant scope' })
  @ApiOkResponse({ description: 'The workspace metadata.' })
  @ApiNotFoundResponse({ description: 'The workspace is not visible.' })
  async getWorkspace(
    @Req() request: unknown,
    @Param('workspaceId') workspaceId: string,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ) {
    const context = await this.requestContext.resolve(request);
    return preserveNotFoundStatus(await this.hierarchy.getWorkspace(context, workspaceId), reply);
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
  async getProject(
    @Req() request: unknown,
    @Param('projectId') projectId: string,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ) {
    const context = await this.requestContext.resolve(request);
    return preserveNotFoundStatus(await this.hierarchy.getProject(context, projectId), reply);
  }
}
