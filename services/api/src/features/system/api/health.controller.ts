import { Controller, Get, Inject } from '@nestjs/common';
import {
  ApiExtension,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { NotReadyError } from '../application/not-ready.error.js';
import { READINESS_PORT, type ReadinessPort } from '../application/readiness.port.js';

@ApiTags('operational')
@ApiExtension('x-databreeze-audience', 'operational')
@Controller('health')
export class HealthController {
  constructor(@Inject(READINESS_PORT) private readonly readiness: ReadinessPort) {}

  @Get('live')
  @ApiOkResponse({
    schema: { properties: { status: { enum: ['ok'], type: 'string' } }, type: 'object' },
  })
  liveness(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOkResponse({
    schema: { properties: { status: { enum: ['ready'], type: 'string' } }, type: 'object' },
  })
  @ApiServiceUnavailableResponse({
    content: {
      'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
    },
  })
  async readinessStatus(): Promise<{ readonly status: 'ready' }> {
    try {
      if (await this.readiness.check()) return { status: 'ready' };
    } catch {
      // Provider details are intentionally collapsed to the stable readiness state.
    }
    throw new NotReadyError();
  }
}
