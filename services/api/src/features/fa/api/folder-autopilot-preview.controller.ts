import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { FolderAutopilotPreviewService } from '../application/folder-autopilot-preview.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import { PreviewFolderAutopilotRecipeDto } from './folder-autopilot-preview.dto.js';

@ApiTags('folder-autopilot')
@ApiBearerAuth()
@Controller('v1/folder-autopilot')
export class FolderAutopilotPreviewController {
  public constructor(
    private readonly previews: FolderAutopilotPreviewService,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Post('ephemeral-preview')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Evaluate a bounded, non-persistent Folder Autopilot dry-run preview',
  })
  @ApiBody({ type: PreviewFolderAutopilotRecipeDto })
  async preview(
    @Req() request: unknown,
    @Body() input: PreviewFolderAutopilotRecipeDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const { files, ...recipe } = input;
    return this.previews.preview(context, { recipe, files });
  }
}
