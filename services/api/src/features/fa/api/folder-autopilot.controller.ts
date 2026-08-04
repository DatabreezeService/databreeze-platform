import {
  applyDecorators,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import {
  FOLDER_AUTOPILOT_SERVICE,
  FOLDER_AUTOPILOT_JRA_FACADE_PORT,
  FolderAutopilotService,
  type FolderAutopilotJraFacadePortV1,
} from '../application/folder-autopilot.service.js';
import {
  CreateAutopilotFolderBindingDto,
  CreateFolderAutopilotProfileDto,
  CreateRecipeAssignmentDto,
  FolderAutopilotApprovalDecisionDto,
  FolderAutopilotUndoRequestDto,
  PauseRecipeAssignmentDto,
  FolderAutopilotRejectedResponseDto,
  UpdateRecipeAssignmentDto,
} from './folder-autopilot.dto.js';
import { buildFolderAutopilotDashboardProjection } from './folder-autopilot-dashboard.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

function folderAutopilotStatus(result: unknown): number {
  if (typeof result !== 'object' || result === null || !('accepted' in result))
    return HttpStatus.SERVICE_UNAVAILABLE;
  const candidate = result as { readonly accepted?: unknown; readonly code?: unknown };
  if (candidate.accepted === true) return HttpStatus.OK;
  switch (candidate.code) {
    case 'FA_SCOPE_NARROWING_REQUIRED':
    case 'DATA_MODE_BROADENS_WORKSPACE':
      return HttpStatus.FORBIDDEN;
    case 'FA_PROFILE_NOT_FOUND':
    case 'FA_BINDING_NOT_FOUND':
    case 'FA_ASSIGNMENT_NOT_FOUND':
      return HttpStatus.NOT_FOUND;
    case 'FA_IMMUTABLE_PROFILE':
    case 'FA_IMMUTABLE_BINDING':
    case 'FA_IMMUTABLE_ASSIGNMENT':
    case 'FA_ASSIGNMENT_REVISION_CONFLICT':
      return HttpStatus.CONFLICT;
    case 'FA_PERSISTENCE_UNAVAILABLE':
    case 'DATA_MODE_POLICY_UNAVAILABLE':
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.BAD_REQUEST;
  }
}

function preserveFolderAutopilotStatus<TValue>(result: TValue, reply?: FastifyReply): TValue {
  if (
    typeof result === 'object' &&
    result !== null &&
    'accepted' in result &&
    (result as { readonly accepted?: unknown }).accepted !== true
  ) {
    reply?.code(folderAutopilotStatus(result));
  }
  return result;
}

function applyFolderAutopilotOutcomeResponses(): MethodDecorator {
  return applyDecorators(
    ApiBadRequestResponse({ type: FolderAutopilotRejectedResponseDto }),
    ApiForbiddenResponse({ type: FolderAutopilotRejectedResponseDto }),
    ApiNotFoundResponse({ type: FolderAutopilotRejectedResponseDto }),
    ApiConflictResponse({ type: FolderAutopilotRejectedResponseDto }),
    ApiGoneResponse({ type: FolderAutopilotRejectedResponseDto }),
    ApiServiceUnavailableResponse({ type: FolderAutopilotRejectedResponseDto }),
  );
}

@ApiTags('folder-autopilot')
@ApiBearerAuth()
@Controller('v1')
export class FolderAutopilotController {
  public constructor(
    @Inject(FOLDER_AUTOPILOT_SERVICE) private readonly service: FolderAutopilotService,
    @Inject(FOLDER_AUTOPILOT_JRA_FACADE_PORT)
    private readonly jraFacade: FolderAutopilotJraFacadePortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Get('autopilot-dashboard')
  @ApiOperation({ summary: 'Read content-free Folder Autopilot dashboard projections' })
  @applyFolderAutopilotOutcomeResponses()
  public async dashboard(
    @Req() request: unknown,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const [profiles, assignments] = await Promise.all([
      this.service.listProfiles(context),
      this.service.listAssignments(context),
    ]);
    if (!profiles.accepted) return preserveFolderAutopilotStatus(profiles, reply);
    if (!assignments.accepted) return preserveFolderAutopilotStatus(assignments, reply);
    return preserveFolderAutopilotStatus({
      accepted: true,
      value: buildFolderAutopilotDashboardProjection(profiles.value, assignments.value),
    }, reply);
  }

  @Post('autopilot-profiles')
  @ApiOperation({ summary: 'Register an immutable, content-free Folder Autopilot profile' })
  @ApiBody({ type: CreateFolderAutopilotProfileDto })
  @applyFolderAutopilotOutcomeResponses()
  public async createProfile(
    @Req() request: unknown,
    @Body() input: CreateFolderAutopilotProfileDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return preserveFolderAutopilotStatus(await this.service.createProfile(context, input), reply);
  }

  @Get('autopilot-profiles')
  @ApiOperation({ summary: 'List Folder Autopilot profile versions visible to the tenant' })
  @applyFolderAutopilotOutcomeResponses()
  public async listProfiles(
    @Req() request: unknown,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return preserveFolderAutopilotStatus(await this.service.listProfiles(context), reply);
  }

  @Get('autopilot-profiles/:profileId')
  @ApiOperation({ summary: 'Read an exact immutable Folder Autopilot profile version' })
  @ApiQuery({ name: 'version', required: false, type: 'integer', minimum: 1, maximum: 10_000 })
  @applyFolderAutopilotOutcomeResponses()
  public async findProfile(
    @Req() request: unknown,
    @Param('profileId') profileId: string,
    @Query('version') version?: string,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const parsedVersion = version === undefined ? undefined : Number(version);
    return preserveFolderAutopilotStatus(
      await this.service.findProfile(context, profileId, parsedVersion),
      reply,
    );
  }

  @Post('autopilot-folder-bindings')
  @ApiOperation({ summary: 'Register an opaque DSO-backed Folder Autopilot binding' })
  @ApiBody({ type: CreateAutopilotFolderBindingDto })
  @applyFolderAutopilotOutcomeResponses()
  public async createBinding(
    @Req() request: unknown,
    @Body() input: CreateAutopilotFolderBindingDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return preserveFolderAutopilotStatus(await this.service.createBinding(context, input), reply);
  }

  @Get('autopilot-folder-bindings')
  @ApiOperation({ summary: 'List opaque Folder Autopilot bindings visible to the tenant' })
  @applyFolderAutopilotOutcomeResponses()
  public async listBindings(
    @Req() request: unknown,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return preserveFolderAutopilotStatus(await this.service.listBindings(context), reply);
  }

  @Get('autopilot-folder-bindings/:bindingId')
  @ApiOperation({ summary: 'Read an opaque Folder Autopilot binding' })
  @applyFolderAutopilotOutcomeResponses()
  public async findBinding(
    @Req() request: unknown,
    @Param('bindingId') bindingId: string,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return preserveFolderAutopilotStatus(await this.service.findBinding(context, bindingId), reply);
  }

  @Post('autopilot-assignments')
  @ApiOperation({ summary: 'Create a tenant-scoped Folder Autopilot assignment projection' })
  @ApiBody({ type: CreateRecipeAssignmentDto })
  @applyFolderAutopilotOutcomeResponses()
  public async createAssignment(
    @Req() request: unknown,
    @Body() input: CreateRecipeAssignmentDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return preserveFolderAutopilotStatus(await this.service.createAssignment(context, {
      ...input,
      idempotencyKey: context.idempotencyKey,
    }), reply);
  }

  @Get('autopilot-assignments')
  @ApiOperation({ summary: 'List Folder Autopilot assignments visible to the tenant' })
  @applyFolderAutopilotOutcomeResponses()
  public async listAssignments(
    @Req() request: unknown,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return preserveFolderAutopilotStatus(await this.service.listAssignments(context), reply);
  }

  @Get('autopilot-assignments/:assignmentId')
  @ApiOperation({ summary: 'Read a tenant-scoped Folder Autopilot assignment' })
  @applyFolderAutopilotOutcomeResponses()
  public async findAssignment(
    @Req() request: unknown,
    @Param('assignmentId') assignmentId: string,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return preserveFolderAutopilotStatus(
      await this.service.findAssignment(context, assignmentId),
      reply,
    );
  }

  @Patch('autopilot-assignments/:assignmentId')
  @ApiOperation({ summary: 'Advance an assignment projection with optimistic concurrency' })
  @ApiBody({ type: UpdateRecipeAssignmentDto })
  @applyFolderAutopilotOutcomeResponses()
  public async updateAssignment(
    @Req() request: unknown,
    @Param('assignmentId') assignmentId: string,
    @Body() input: UpdateRecipeAssignmentDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return preserveFolderAutopilotStatus(await this.service.updateAssignmentState(
      context,
      assignmentId,
      input.expectedRevision,
      input.state,
    ), reply);
  }

  @Post('autopilot-assignments/:assignmentId/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause an assignment projection with optimistic concurrency' })
  @ApiBody({ type: PauseRecipeAssignmentDto })
  @applyFolderAutopilotOutcomeResponses()
  public async pauseAssignment(
    @Req() request: unknown,
    @Param('assignmentId') assignmentId: string,
    @Body() input: PauseRecipeAssignmentDto,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return preserveFolderAutopilotStatus(await this.service.updateAssignmentState(
      context,
      assignmentId,
      input.expectedRevision,
      'PAUSED',
    ), reply);
  }

  @Post('autopilot-approvals/:approvalId/decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a decision through the JRA-owned approval facade' })
  @ApiBody({ type: FolderAutopilotApprovalDecisionDto })
  public async decideApproval(
    @Req() request: unknown,
    @Param('approvalId') approvalId: string,
    @Body() input: FolderAutopilotApprovalDecisionDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.service.decideApproval(context, approvalId, { ...input }, this.jraFacade);
  }

  @Post('autopilot-executions/:executionId/undo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request undo through the JRA/desktop effect facade' })
  @ApiBody({ type: FolderAutopilotUndoRequestDto })
  public async requestUndo(
    @Req() request: unknown,
    @Param('executionId') executionId: string,
    @Body() input: FolderAutopilotUndoRequestDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.service.requestUndo(context, executionId, { ...input }, this.jraFacade);
  }
}
