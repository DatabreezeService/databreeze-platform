import { Injectable } from '@nestjs/common';

import {
  listProductModulesV1,
  type ModuleCatalogEntryV1,
} from '@databreeze/domain/module-catalog/v1';

/**
 * Read-only application service for the canonical product module catalog.
 *
 * Keeping this behind the system feature gives every client one stable source
 * for module identity, lifecycle, platform coverage, and workflow stages.
 */
@Injectable()
export class ModuleCatalogService {
  list(): readonly ModuleCatalogEntryV1[] {
    return listProductModulesV1();
  }
}
