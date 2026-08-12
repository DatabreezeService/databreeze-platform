import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TableExtractionService } from '../application/table-extraction.service.js';

export interface TableExtractionRequestDtoV1 {
  readonly mimeType: string;
  readonly bytesBase64: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly pageCount: number;
  readonly decompressionRatio?: number;
}

@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/table-extractions')
export class TableExtractionController {
  public constructor(private readonly service: TableExtractionService) {}

  @Post()
  public async extract(@Body() dto: TableExtractionRequestDtoV1) {
    const bytes = Buffer.from(dto.bytesBase64, 'base64');
    const result = await this.service.extract({
      mimeType: dto.mimeType,
      bytes,
      widthPx: dto.widthPx,
      heightPx: dto.heightPx,
      pageCount: dto.pageCount,
      ...(dto.decompressionRatio === undefined
        ? {}
        : { decompressionRatio: dto.decompressionRatio }),
    });
    return result;
  }
}
