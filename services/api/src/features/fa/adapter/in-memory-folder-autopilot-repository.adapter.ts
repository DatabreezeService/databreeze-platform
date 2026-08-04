import { tenantScopeContainsV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type {
  AutopilotFolderBindingV1,
  FolderAutopilotProfileV1,
  RecipeAssignmentStateV1,
  RecipeAssignmentV1,
} from '@databreeze/domain/folder-autopilot/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  FolderAutopilotRepositoryPortV1,
  FolderAutopilotTransactionPortV1,
} from '../application/folder-autopilot-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function cloneProfile(profile: FolderAutopilotProfileV1): FolderAutopilotProfileV1 {
  return Object.freeze({
    ...profile,
    tenantScope: Object.freeze({ ...profile.tenantScope }),
  });
}

function cloneBinding(binding: AutopilotFolderBindingV1): AutopilotFolderBindingV1 {
  return Object.freeze({
    ...binding,
    tenantScope: Object.freeze({ ...binding.tenantScope }),
  });
}

function cloneAssignment(assignment: RecipeAssignmentV1): RecipeAssignmentV1 {
  return Object.freeze({
    ...assignment,
    tenantScope: Object.freeze({ ...assignment.tenantScope }),
    inputBindingIds: Object.freeze([...assignment.inputBindingIds]),
    outputBindingIds: Object.freeze([...assignment.outputBindingIds]),
  });
}

function profileKey(profile: Pick<FolderAutopilotProfileV1, 'profileId' | 'version'>): string {
  return `${profile.profileId}:${profile.version}`;
}

/** Test/local adapter. Durable deployments use the Prisma adapter with the same port. */
export class InMemoryFolderAutopilotRepositoryAdapter implements FolderAutopilotRepositoryPortV1 {
  private profiles = new Map<string, FolderAutopilotProfileV1>();
  private bindings = new Map<string, AutopilotFolderBindingV1>();
  private assignments = new Map<string, RecipeAssignmentV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  private async saveProfileUnlocked(
    context: IamTenantContextV1,
    profile: FolderAutopilotProfileV1,
  ): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, profile.tenantScope))
      throw new Error('FA_SCOPE_NARROWING_REQUIRED');
    const key = profileKey(profile);
    const existing = this.profiles.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(profile))
      throw new Error('FA_IMMUTABLE_PROFILE');
    this.profiles.set(key, cloneProfile(profile));
  }

  private async findProfileUnlocked(
    context: IamTenantContextV1,
    profileId: StableIdentifierV1,
    version?: number,
  ): Promise<FolderAutopilotProfileV1 | undefined> {
    await Promise.resolve();
    const values = [...this.profiles.values()].filter(
      (profile) =>
        profile.profileId === profileId &&
        (version === undefined || profile.version === version) &&
        visible(context.tenantScope, profile.tenantScope),
    );
    values.sort((left, right) => right.version - left.version);
    return values[0] ? cloneProfile(values[0]) : undefined;
  }

  private async listProfilesUnlocked(
    context: IamTenantContextV1,
  ): Promise<readonly FolderAutopilotProfileV1[]> {
    await Promise.resolve();
    return [...this.profiles.values()]
      .filter((profile) => visible(context.tenantScope, profile.tenantScope))
      .sort((left, right) =>
        `${left.profileId}:${left.version}`.localeCompare(`${right.profileId}:${right.version}`),
      )
      .map(cloneProfile);
  }

  private async saveBindingUnlocked(
    context: IamTenantContextV1,
    binding: AutopilotFolderBindingV1,
  ): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, binding.tenantScope))
      throw new Error('FA_SCOPE_NARROWING_REQUIRED');
    const existing = this.bindings.get(binding.bindingId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(binding))
      throw new Error('FA_IMMUTABLE_BINDING');
    this.bindings.set(binding.bindingId, cloneBinding(binding));
  }

  private async findBindingUnlocked(
    context: IamTenantContextV1,
    bindingId: StableIdentifierV1,
  ): Promise<AutopilotFolderBindingV1 | undefined> {
    await Promise.resolve();
    const binding = this.bindings.get(bindingId);
    return binding && visible(context.tenantScope, binding.tenantScope)
      ? cloneBinding(binding)
      : undefined;
  }

  private async listBindingsUnlocked(
    context: IamTenantContextV1,
  ): Promise<readonly AutopilotFolderBindingV1[]> {
    await Promise.resolve();
    return [...this.bindings.values()]
      .filter((binding) => visible(context.tenantScope, binding.tenantScope))
      .sort((left, right) => left.bindingId.localeCompare(right.bindingId))
      .map(cloneBinding);
  }

  private async saveAssignmentUnlocked(
    context: IamTenantContextV1,
    assignment: RecipeAssignmentV1,
  ): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, assignment.tenantScope))
      throw new Error('FA_SCOPE_NARROWING_REQUIRED');
    const existing = this.assignments.get(assignment.assignmentId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(assignment))
      throw new Error('FA_IMMUTABLE_ASSIGNMENT');
    this.assignments.set(assignment.assignmentId, cloneAssignment(assignment));
  }

  private async findAssignmentUnlocked(
    context: IamTenantContextV1,
    assignmentId: StableIdentifierV1,
  ): Promise<RecipeAssignmentV1 | undefined> {
    await Promise.resolve();
    const assignment = this.assignments.get(assignmentId);
    return assignment && visible(context.tenantScope, assignment.tenantScope)
      ? cloneAssignment(assignment)
      : undefined;
  }

  private async listAssignmentsUnlocked(
    context: IamTenantContextV1,
  ): Promise<readonly RecipeAssignmentV1[]> {
    await Promise.resolve();
    return [...this.assignments.values()]
      .filter((assignment) => visible(context.tenantScope, assignment.tenantScope))
      .sort((left, right) => left.assignmentId.localeCompare(right.assignmentId))
      .map(cloneAssignment);
  }

  private async updateAssignmentStateUnlocked(
    context: IamTenantContextV1,
    assignmentId: StableIdentifierV1,
    expectedRevision: number,
    state: RecipeAssignmentStateV1,
  ): Promise<RecipeAssignmentV1> {
    await Promise.resolve();
    const existing = this.assignments.get(assignmentId);
    if (!existing || !visible(context.tenantScope, existing.tenantScope))
      throw new Error('FA_ASSIGNMENT_NOT_FOUND');
    if (!tenantScopeContainsV1(context.tenantScope, existing.tenantScope))
      throw new Error('FA_SCOPE_NARROWING_REQUIRED');
    if (existing.revision !== expectedRevision) throw new Error('FA_ASSIGNMENT_REVISION_CONFLICT');
    const next = cloneAssignment({ ...existing, state, revision: existing.revision + 1 });
    this.assignments.set(assignmentId, next);
    return cloneAssignment(next);
  }

  public async saveProfile(
    context: IamTenantContextV1,
    profile: FolderAutopilotProfileV1,
  ): Promise<void> {
    await this.withTransaction(context, (transaction) => transaction.saveProfile(context, profile));
  }

  public findProfile(context: IamTenantContextV1, profileId: StableIdentifierV1, version?: number) {
    return this.findProfileUnlocked(context, profileId, version);
  }

  public listProfiles(context: IamTenantContextV1) {
    return this.listProfilesUnlocked(context);
  }

  public async saveBinding(
    context: IamTenantContextV1,
    binding: AutopilotFolderBindingV1,
  ): Promise<void> {
    await this.withTransaction(context, (transaction) => transaction.saveBinding(context, binding));
  }

  public findBinding(context: IamTenantContextV1, bindingId: StableIdentifierV1) {
    return this.findBindingUnlocked(context, bindingId);
  }

  public listBindings(context: IamTenantContextV1) {
    return this.listBindingsUnlocked(context);
  }

  public async saveAssignment(
    context: IamTenantContextV1,
    assignment: RecipeAssignmentV1,
  ): Promise<void> {
    await this.withTransaction(context, (transaction) =>
      transaction.saveAssignment(context, assignment),
    );
  }

  public findAssignment(context: IamTenantContextV1, assignmentId: StableIdentifierV1) {
    return this.findAssignmentUnlocked(context, assignmentId);
  }

  public listAssignments(context: IamTenantContextV1) {
    return this.listAssignmentsUnlocked(context);
  }

  public updateAssignmentState(
    context: IamTenantContextV1,
    assignmentId: StableIdentifierV1,
    expectedRevision: number,
    state: RecipeAssignmentStateV1,
  ) {
    return this.withTransaction(context, (transaction) =>
      transaction.updateAssignmentState(context, assignmentId, expectedRevision, state),
    );
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: FolderAutopilotTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = {
      profiles: new Map(this.profiles),
      bindings: new Map(this.bindings),
      assignments: new Map(this.assignments),
    };
    try {
      return await work({
        saveProfile: this.saveProfileUnlocked.bind(this),
        findProfile: this.findProfileUnlocked.bind(this),
        listProfiles: this.listProfilesUnlocked.bind(this),
        saveBinding: this.saveBindingUnlocked.bind(this),
        findBinding: this.findBindingUnlocked.bind(this),
        listBindings: this.listBindingsUnlocked.bind(this),
        saveAssignment: this.saveAssignmentUnlocked.bind(this),
        findAssignment: this.findAssignmentUnlocked.bind(this),
        listAssignments: this.listAssignmentsUnlocked.bind(this),
        updateAssignmentState: this.updateAssignmentStateUnlocked.bind(this),
      });
    } catch (error) {
      this.profiles = before.profiles;
      this.bindings = before.bindings;
      this.assignments = before.assignments;
      throw error;
    } finally {
      release();
    }
  }
}
