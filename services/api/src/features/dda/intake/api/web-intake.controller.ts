import { Body, Controller, Get, Post } from '@nestjs/common';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { DdaWebIntakeProfileV1 } from '../application/intake-profile.port.js';
import { WebIntakeProblemError } from '../application/web-intake-problem.error.js';
import { WebIntakeServiceV1 } from '../application/web-intake.service.js';
import type { WebIntakeFinalizeDtoV1, WebIntakeFinalizeResponseDtoV1 } from './web-intake.dto.js';

/** DDA-002: Web intake control plane returns IDs/status only. */
@Controller('v1/dda/web-intake')
export class WebIntakeController {
  public constructor(private readonly service: WebIntakeServiceV1) {}

  @Get('profile')
  public async getProfile(): Promise<DdaWebIntakeProfileV1> {
    await Promise.resolve();
    return this.service.publishedProfile();
  }

  @Post('finalize')
  public async finalize(
    @Body() dto: WebIntakeFinalizeDtoV1,
  ): Promise<WebIntakeFinalizeResponseDtoV1> {
    const tenantScope = parseTenantScopeV1(dto.tenantScope);
    if (!tenantScope.accepted) {
      throw new WebIntakeProblemError('DDA_INTAKE_UNSUPPORTED_PROFILE');
    }
    const bytes = Buffer.from(dto.contentBase64, 'base64');
    const result = await this.service.finalizeUpload({
      tenantScope: tenantScope.value,
      sessionId: dto.sessionId,
      fileName: dto.fileName,
      claimedMediaType: dto.claimedMediaType,
      expectedSha256: dto.expectedSha256,
      bytes,
      ...(dto.declaredEncoding === undefined ? {} : { declaredEncoding: dto.declaredEncoding }),
    });
    if (!result.accepted) throw new WebIntakeProblemError(result.code);
    return {
      accepted: true,
      sessionId: result.value.sessionId,
      artifactVersionId: result.value.artifactVersionId,
      status: result.value.status,
      profileId: result.value.profileId,
    };
  }
}
