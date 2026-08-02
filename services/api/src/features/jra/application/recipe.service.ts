import {
  createRecipePublicationEnvelopeV1,
  createRecipeTriggerV1,
  createRecipeVersionV1,
  publishRecipeVersionV1,
  type RecipePublicationEnvelopeV1,
  type RecipeResultV1,
  type RecipeTriggerV1,
  type RecipeVersionV1,
} from '@databreeze/domain/recipe/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { RecipeRepositoryPortV1 } from './recipe-repository.port.js';

function rejected<TValue>(code: 'INVALID_IDENTIFIER'): RecipeResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

/** Coordinates immutable recipes, trigger registrations, and signed envelopes. */
export class RecipeService {
  public constructor(private readonly repository: RecipeRepositoryPortV1) {}

  public async createVersion(
    context: IamTenantContextV1,
    input: Parameters<typeof createRecipeVersionV1>[0],
  ): Promise<RecipeResultV1<RecipeVersionV1>> {
    const created = createRecipeVersionV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.findVersion(
        context,
        created.value.recipeId,
        created.value.version,
      );
      if (existing) {
        return JSON.stringify(existing) === JSON.stringify(created.value)
          ? Object.freeze({ accepted: true, value: existing })
          : rejected('INVALID_IDENTIFIER');
      }
      await transaction.saveVersion(context, created.value);
      return created;
    });
  }

  public async publishVersion(
    context: IamTenantContextV1,
    recipeId: StableIdentifierV1,
    version: number,
    publishedAt: unknown,
  ): Promise<RecipeResultV1<RecipeVersionV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.findVersion(context, recipeId, version);
      if (!current) return rejected('INVALID_IDENTIFIER');
      const published = publishRecipeVersionV1(current, publishedAt);
      if (!published.accepted) return published;
      await transaction.updateVersion(context, published.value);
      return published;
    });
  }

  public async registerTrigger(
    context: IamTenantContextV1,
    input: Parameters<typeof createRecipeTriggerV1>[0],
  ): Promise<RecipeResultV1<RecipeTriggerV1>> {
    const created = createRecipeTriggerV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const recipe = await transaction.findVersion(
        context,
        created.value.recipeId,
        created.value.recipeVersion,
      );
      if (!recipe || recipe.state !== 'PUBLISHED') return rejected('INVALID_IDENTIFIER');
      const existing = await transaction.findTrigger(context, created.value.triggerId);
      if (existing) {
        return JSON.stringify(existing) === JSON.stringify(created.value)
          ? Object.freeze({ accepted: true, value: existing })
          : rejected('INVALID_IDENTIFIER');
      }
      await transaction.saveTrigger(context, created.value);
      return created;
    });
  }

  public async publishEnvelope(
    context: IamTenantContextV1,
    input: Parameters<typeof createRecipePublicationEnvelopeV1>[0],
  ): Promise<RecipeResultV1<RecipePublicationEnvelopeV1>> {
    const created = createRecipePublicationEnvelopeV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.findEnvelope(
        context,
        created.value.recipeId,
        created.value.recipeVersion,
      );
      if (existing) {
        return JSON.stringify(existing) === JSON.stringify(created.value)
          ? Object.freeze({ accepted: true, value: existing })
          : rejected('INVALID_IDENTIFIER');
      }
      await transaction.saveEnvelope(context, created.value);
      return created;
    });
  }
}
