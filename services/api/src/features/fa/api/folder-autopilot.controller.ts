import {
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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

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
  UpdateRecipeAssignmentDto,
} from './folder-autopilot.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

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
  public async dashboard(@Req() request: unknown): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const [profiles, bindings, assignments] = await Promise.all([
      this.service.listProfiles(context),
      this.service.listBindings(context),
      this.service.listAssignments(context),
    ]);
    return {
      accepted: true,
      value: {
        profiles: profiles.accepted ? profiles.value : [],
        bindings: bindings.accepted ? bindings.value : [],
        assignments: assignments.accepted ? assignments.value : [],
        previews: [],
        approvals: [],
        executions: [],
        exceptions: [],
        health: [],
      },
    };
  }

  @Post('autopilot-profiles')
  @ApiOperation({ summary: 'Register an immutable, content-free Folder Autopilot profile' })
  @ApiBody({ type: CreateFolderAutopilotProfileDto })
  public async createProfile(
    @Req() request: unknown,
    @Body() input: CreateFolderAutopilotProfileDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.service.createProfile(context, input);
  }

  @Get('autopilot-profiles')
  @ApiOperation({ summary: 'List Folder Autopilot profile versions visible to the tenant' })
  public async listProfiles(@Req() request: unknown): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.service.listProfiles(context);
  }

  @Get('autopilot-profiles/:profileId')
  @ApiOperation({ summary: 'Read an exact immutable Folder Autopilot profile version' })
  @ApiQuery({ name: 'version', required: false, type: 'integer', minimum: 1 })
  public async findProfile(
    @Req() request: unknown,
    @Param('profileId') profileId: string,
    @Query('version') version?: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const parsedVersion = version === undefined ? undefined : Number(version);
    return this.service.findProfile(context, profileId, parsedVersion);
  }

  @Post('autopilot-folder-bindings')
  @ApiOperation({ summary: 'Register an opaque DSO-backed Folder Autopilot binding' })
  @ApiBody({ type: CreateAutopilotFolderBindingDto })
  public async createBinding(
    @Req() request: unknown,
    @Body() input: CreateAutopilotFolderBindingDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.service.createBinding(context, input);
  }

  @Get('autopilot-folder-bindings')
  @ApiOperation({ summary: 'List opaque Folder Autopilot bindings visible to the tenant' })
  public async listBindings(@Req() request: unknown): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.service.listBindings(context);
  }

  @Get('autopilot-folder-bindings/:bindingId')
  @ApiOperation({ summary: 'Read an opaque Folder Autopilot binding' })
  public async findBinding(
    @Req() request: unknown,
    @Param('bindingId') bindingId: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.service.findBinding(context, bindingId);
  }

  @Post('autopilot-assignments')
  @ApiOperation({ summary: 'Create a tenant-scoped Folder Autopilot assignment projection' })
  @ApiBody({ type: CreateRecipeAssignmentDto })
  public async createAssignment(
    @Req() request: unknown,
    @Body() input: CreateRecipeAssignmentDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.service.createAssignment(context, {
      ...input,
      idempotencyKey: context.idempotencyKey,
    });
  }

  @Get('autopilot-assignments')
  @ApiOperation({ summary: 'List Folder Autopilot assignments visible to the tenant' })
  public async listAssignments(@Req() request: unknown): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.service.listAssignments(context);
  }

  @Get('autopilot-assignments/:assignmentId')
  @ApiOperation({ summary: 'Read a tenant-scoped Folder Autopilot assignment' })
  public async findAssignment(
    @Req() request: unknown,
    @Param('assignmentId') assignmentId: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.service.findAssignment(context, assignmentId);
  }

  @Patch('autopilot-assignments/:assignmentId')
  @ApiOperation({ summary: 'Advance an assignment projection with optimistic concurrency' })
  @ApiBody({ type: UpdateRecipeAssignmentDto })
  public async updateAssignment(
    @Req() request: unknown,
    @Param('assignmentId') assignmentId: string,
    @Body() input: UpdateRecipeAssignmentDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.service.updateAssignmentState(
      context,
      assignmentId,
      input.expectedRevision,
      input.state,
    );
  }

  @Post('autopilot-assignments/:assignmentId/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause an assignment projection with optimistic concurrency' })
  @ApiBody({ type: PauseRecipeAssignmentDto })
  public async pauseAssignment(
    @Req() request: unknown,
    @Param('assignmentId') assignmentId: string,
    @Body() input: PauseRecipeAssignmentDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.service.updateAssignmentState(context, assignmentId, input.expectedRevision, 'PAUSED');
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
