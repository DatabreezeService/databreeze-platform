import type {
  ContentSafeBoundInputEventV1,
  DependencyRepositoryPortV1,
  MaterializationDefinitionBindingV1,
} from './dependency-repository.port.js';
import type { MaterializationProcessorCatalog } from './materialization-processor-catalog.js';

export type DependencyIndexErrorCodeV1 =
  | 'UNAUTHORIZED_EVENT_REFERENCE'
  | 'CROSS_TENANT_EVENT_REFERENCE';

export interface DependencyResolutionV1 {
  readonly eventId: string;
  readonly affectedDefinitionIds: readonly string[];
  readonly bindings: readonly MaterializationDefinitionBindingV1[];
  readonly ignoredReason?: 'DUPLICATE_EVENT' | 'OUT_OF_ORDER_EVENT';
}

export type DependencyIndexResultV1 =
  | { readonly accepted: true; readonly value: DependencyResolutionV1 }
  | { readonly accepted: false; readonly code: DependencyIndexErrorCodeV1 };

/** DDA-028: resolve versioned dependency index from content-safe bound-input events. */
export class DependencyIndexService {
  public constructor(
    private readonly repository: DependencyRepositoryPortV1,
    private readonly catalog: MaterializationProcessorCatalog,
  ) {
    void this.catalog;
  }

  public async resolveAffected(
    event: ContentSafeBoundInputEventV1,
  ): Promise<DependencyIndexResultV1> {
    // Strip unknown fields — protected values never ride in events.
    const safeEvent: ContentSafeBoundInputEventV1 = Object.freeze({
      eventId: event.eventId,
      tenantScope: event.tenantScope,
      changeKind: event.changeKind,
      referenceId: event.referenceId,
      occurredAt: event.occurredAt,
      sequence: event.sequence,
      authorized: event.authorized,
    });

    if (!safeEvent.authorized) {
      return Object.freeze({ accepted: false, code: 'UNAUTHORIZED_EVENT_REFERENCE' });
    }

    if (
      await this.repository.isReferenceOwnedByOtherTenant(
        safeEvent.tenantScope,
        safeEvent.changeKind,
        safeEvent.referenceId,
      )
    ) {
      return Object.freeze({ accepted: false, code: 'CROSS_TENANT_EVENT_REFERENCE' });
    }

    const prior = await this.repository.findProcessedEvent(safeEvent.eventId);
    if (prior) {
      const priorBindings = await this.repository.findBindingsByReference(
        safeEvent.tenantScope,
        safeEvent.changeKind,
        safeEvent.referenceId,
      );
      return Object.freeze({
        accepted: true,
        value: Object.freeze({
          eventId: safeEvent.eventId,
          affectedDefinitionIds: Object.freeze(
            priorBindings.map((binding) => binding.materializationDefinitionId),
          ),
          bindings: priorBindings,
          ignoredReason: 'DUPLICATE_EVENT' as const,
        }),
      });
    }

    const highest = await this.repository.highestSequence(safeEvent.tenantScope);
    if (safeEvent.sequence < highest) {
      return Object.freeze({
        accepted: true,
        value: Object.freeze({
          eventId: safeEvent.eventId,
          affectedDefinitionIds: Object.freeze([] as string[]),
          bindings: Object.freeze([] as MaterializationDefinitionBindingV1[]),
          ignoredReason: 'OUT_OF_ORDER_EVENT' as const,
        }),
      });
    }

    const bindings = await this.repository.findBindingsByReference(
      safeEvent.tenantScope,
      safeEvent.changeKind,
      safeEvent.referenceId,
    );

    await this.repository.rememberProcessedEvent(safeEvent.eventId, safeEvent.sequence);
    await this.repository.advanceSequence(safeEvent.tenantScope, safeEvent.sequence);

    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        eventId: safeEvent.eventId,
        affectedDefinitionIds: Object.freeze(
          bindings.map((binding) => binding.materializationDefinitionId),
        ),
        bindings,
      }),
    });
  }
}
