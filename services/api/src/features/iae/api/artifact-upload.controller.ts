import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  ARTIFACT_UPLOAD_REPOSITORY_PORT,
  type ArtifactUploadRepositoryPortV1,
} from '../application/artifact-upload-repository.port.js';
import { ArtifactUploadService } from '../application/artifact-upload.service.js';
import {
  AbortArtifactUploadDto,
  CompleteArtifactUploadDto,
  CreateArtifactUploadSessionDto,
  IssueArtifactUploadTransferDto,
  RecordArtifactUploadPartDto,
} from './artifact-upload.dto.js';
import {
  ARTIFACT_UPLOAD_STORAGE_PORT,
  type ArtifactUploadStoragePortV1,
} from '../application/artifact-upload-storage.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

/** IAE-014: upload control-plane metadata only; bytes travel through a separately governed transfer adapter. */
@ApiTags('artifacts')
@ApiBearerAuth()
@Controller('v1/artifact-upload-sessions')
export class ArtifactUploadController {
  private readonly uploads: ArtifactUploadService;

  public constructor(
    @Inject(ARTIFACT_UPLOAD_REPOSITORY_PORT) repository: ArtifactUploadRepositoryPortV1,
    @Inject(ARTIFACT_UPLOAD_STORAGE_PORT) storage: ArtifactUploadStoragePortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.uploads = new ArtifactUploadService(repository, storage);
  }

  @Post(':sessionId/parts/transfer')
  @ApiOperation({ summary: 'Issue one opaque upload-part transfer grant' })
  @ApiBody({ type: IssueArtifactUploadTransferDto })
  async issuePartTransfer(
    @Req() request: unknown,
    @Param('sessionId') sessionIdInput: string,
    @Body() input: IssueArtifactUploadTransferDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const sessionId = parseStableIdentifierV1(sessionIdInput);
    if (!sessionId.accepted) return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' });
    return this.uploads.issuePartTransfer(context, sessionId.value, input.partNumber);
  }

  @Post()
  @ApiOperation({ summary: 'Create a bounded resumable artifact upload session' })
  @ApiBody({ type: CreateArtifactUploadSessionDto })
  async create(
    @Req() request: unknown,
    @Body() input: CreateArtifactUploadSessionDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.uploads.create(context, { ...input, tenantScope: context.tenantScope });
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Read upload session metadata and completed part digests' })
  async find(
    @Req() request: unknown,
    @Param('sessionId') sessionIdInput: string,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const sessionId = parseStableIdentifierV1(sessionIdInput);
    if (!sessionId.accepted) return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' });
    const session = await this.uploads.find(context, sessionId.value);
    return session
      ? Object.freeze({ accepted: true, value: session })
      : Object.freeze({ accepted: false, code: 'NOT_FOUND' });
  }

  @Post(':sessionId/parts')
  @ApiOperation({ summary: 'Record one verified upload part digest' })
  @ApiBody({ type: RecordArtifactUploadPartDto })
  async part(
    @Req() request: unknown,
    @Param('sessionId') sessionIdInput: string,
    @Body() input: RecordArtifactUploadPartDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const sessionId = parseStableIdentifierV1(sessionIdInput);
    if (!sessionId.accepted) return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' });
    return this.uploads.recordPart(context, sessionId.value, input);
  }

  @Post(':sessionId/complete')
  @ApiOperation({
    summary: 'Finalize an upload after all part digests and the assembled hash match',
  })
  @ApiBody({ type: CompleteArtifactUploadDto })
  async complete(
    @Req() request: unknown,
    @Param('sessionId') sessionIdInput: string,
    @Body() input: CompleteArtifactUploadDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const sessionId = parseStableIdentifierV1(sessionIdInput);
    if (!sessionId.accepted) return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' });
    return this.uploads.complete(context, sessionId.value, input);
  }

  @Post(':sessionId/abort')
  @ApiOperation({ summary: 'Abort an open upload session' })
  @ApiBody({ type: AbortArtifactUploadDto })
  async abort(
    @Req() request: unknown,
    @Param('sessionId') sessionIdInput: string,
    @Body() input: AbortArtifactUploadDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const sessionId = parseStableIdentifierV1(sessionIdInput);
    if (!sessionId.accepted) return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' });
    return this.uploads.abort(context, sessionId.value, input.expectedRevision);
  }
}
