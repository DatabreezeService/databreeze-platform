import {
  tenantScopeContainsV1,
  type RecipePublicationEnvelopeV1,
  type RecipeTriggerV1,
  type RecipeVersionV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  RecipeRepositoryPortV1,
  RecipeTransactionPortV1,
} from '../application/recipe-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function mutable(context: IamTenantContextV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, candidate);
}

function cloneVersion(recipe: RecipeVersionV1): RecipeVersionV1 {
  return Object.freeze({
    ...recipe,
    tenantScope: Object.freeze({ ...recipe.tenantScope }),
    actionDefinitions: Object.freeze(
      recipe.actionDefinitions.map((action) =>
        Object.freeze({
          ...action,
          requiredCapabilities: Object.freeze([...action.requiredCapabilities]),
        }),
      ),
    ),
  });
}

function cloneTrigger(trigger: RecipeTriggerV1): RecipeTriggerV1 {
  return Object.freeze({ ...trigger, tenantScope: Object.freeze({ ...trigger.tenantScope }) });
}

function cloneEnvelope(envelope: RecipePublicationEnvelopeV1): RecipePublicationEnvelopeV1 {
  return Object.freeze({
    ...envelope,
    actionHandlerDigests: Object.freeze([...envelope.actionHandlerDigests]),
    actionSchemaIds: Object.freeze([...envelope.actionSchemaIds]),
    dsmDefinitionHashes: Object.freeze([...envelope.dsmDefinitionHashes]),
    policyReferenceHashes: Object.freeze([...envelope.policyReferenceHashes]),
  });
}

/** In-memory JRA recipe adapter; versions, triggers, and envelopes are immutable. */
export class InMemoryRecipeRepositoryAdapter implements RecipeRepositoryPortV1 {
  private versions = new Map<string, RecipeVersionV1>();
  private triggers = new Map<string, RecipeTriggerV1>();
  private envelopes = new Map<string, RecipePublicationEnvelopeV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async saveVersion(context: IamTenantContextV1, recipe: RecipeVersionV1): Promise<void> {
    await Promise.resolve();
    if (!mutable(context, recipe.tenantScope)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const key = `${recipe.recipeId}:${recipe.version}`;
    const existing = this.versions.get(key);
    if (existing && JSON.stringify(existing) === JSON.stringify(recipe)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_RECIPE');
    this.versions.set(key, cloneVersion(recipe));
  }

  public async findVersion(
    context: IamTenantContextV1,
    recipeId: StableIdentifierV1,
    version: number,
  ): Promise<RecipeVersionV1 | undefined> {
    await Promise.resolve();
    const recipe = this.versions.get(`${recipeId}:${version}`);
    return recipe && visible(context.tenantScope, recipe.tenantScope)
      ? cloneVersion(recipe)
      : undefined;
  }

  public async updateVersion(context: IamTenantContextV1, recipe: RecipeVersionV1): Promise<void> {
    await Promise.resolve();
    if (!mutable(context, recipe.tenantScope)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const key = `${recipe.recipeId}:${recipe.version}`;
    const existing = this.versions.get(key);
    if (!existing) throw new Error('JRA_RECIPE_NOT_FOUND');
    if (
      existing.recipeHash !== recipe.recipeHash ||
      JSON.stringify(existing.actionDefinitions) !== JSON.stringify(recipe.actionDefinitions)
    )
      throw new Error('JRA_IMMUTABLE_RECIPE');
    this.versions.set(key, cloneVersion(recipe));
  }

  public async saveTrigger(context: IamTenantContextV1, trigger: RecipeTriggerV1): Promise<void> {
    await Promise.resolve();
    if (!mutable(context, trigger.tenantScope)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.triggers.get(trigger.triggerId);
    if (existing && JSON.stringify(existing) === JSON.stringify(trigger)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_TRIGGER');
    this.triggers.set(trigger.triggerId, cloneTrigger(trigger));
  }

  public async findTrigger(
    context: IamTenantContextV1,
    triggerId: StableIdentifierV1,
  ): Promise<RecipeTriggerV1 | undefined> {
    await Promise.resolve();
    const trigger = this.triggers.get(triggerId);
    return trigger && visible(context.tenantScope, trigger.tenantScope)
      ? cloneTrigger(trigger)
      : undefined;
  }

  public async saveEnvelope(
    context: IamTenantContextV1,
    envelope: RecipePublicationEnvelopeV1,
  ): Promise<void> {
    await Promise.resolve();
    const recipe = this.versions.get(`${envelope.recipeId}:${envelope.recipeVersion}`);
    if (!recipe || !mutable(context, recipe.tenantScope))
      throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    if (recipe.recipeHash !== envelope.recipeHash || recipe.state !== 'PUBLISHED')
      throw new Error('JRA_RECIPE_NOT_PUBLISHED');
    const key = `${envelope.recipeId}:${envelope.recipeVersion}`;
    const existing = this.envelopes.get(key);
    if (existing && JSON.stringify(existing) === JSON.stringify(envelope)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_ENVELOPE');
    this.envelopes.set(key, cloneEnvelope(envelope));
  }

  public async findEnvelope(
    context: IamTenantContextV1,
    recipeId: StableIdentifierV1,
    recipeVersion: number,
  ): Promise<RecipePublicationEnvelopeV1 | undefined> {
    await Promise.resolve();
    const envelope = this.envelopes.get(`${recipeId}:${recipeVersion}`);
    const recipe = this.versions.get(`${recipeId}:${recipeVersion}`);
    return envelope && recipe && visible(context.tenantScope, recipe.tenantScope)
      ? cloneEnvelope(envelope)
      : undefined;
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: RecipeTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = {
      versions: new Map(this.versions),
      triggers: new Map(this.triggers),
      envelopes: new Map(this.envelopes),
    };
    try {
      return await work({
        saveVersion: this.saveVersion.bind(this),
        findVersion: this.findVersion.bind(this),
        updateVersion: this.updateVersion.bind(this),
        saveTrigger: this.saveTrigger.bind(this),
        findTrigger: this.findTrigger.bind(this),
        saveEnvelope: this.saveEnvelope.bind(this),
        findEnvelope: this.findEnvelope.bind(this),
      });
    } catch (error) {
      this.versions = before.versions;
      this.triggers = before.triggers;
      this.envelopes = before.envelopes;
      throw error;
    } finally {
      release();
    }
  }
}
