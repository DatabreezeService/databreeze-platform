import type {
  RecipePublicationEnvelopeV1,
  RecipeTriggerV1,
  RecipeVersionV1,
} from '@databreeze/domain/recipe/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const RECIPE_REPOSITORY_PORT = Symbol('RECIPE_REPOSITORY_PORT');

export interface RecipeTransactionPortV1 {
  saveVersion(context: IamTenantContextV1, recipe: RecipeVersionV1): Promise<void>;
  findVersion(
    context: IamTenantContextV1,
    recipeId: StableIdentifierV1,
    version: number,
  ): Promise<RecipeVersionV1 | undefined>;
  updateVersion(context: IamTenantContextV1, recipe: RecipeVersionV1): Promise<void>;
  saveTrigger(context: IamTenantContextV1, trigger: RecipeTriggerV1): Promise<void>;
  findTrigger(
    context: IamTenantContextV1,
    triggerId: StableIdentifierV1,
  ): Promise<RecipeTriggerV1 | undefined>;
  saveEnvelope(context: IamTenantContextV1, envelope: RecipePublicationEnvelopeV1): Promise<void>;
  findEnvelope(
    context: IamTenantContextV1,
    recipeId: StableIdentifierV1,
    recipeVersion: number,
  ): Promise<RecipePublicationEnvelopeV1 | undefined>;
}

export interface RecipeRepositoryPortV1 extends RecipeTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: RecipeTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
