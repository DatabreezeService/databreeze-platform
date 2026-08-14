import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export const FOLDER_PROJECTION_AUTHORIZATION_PORT = Symbol('FOLDER_PROJECTION_AUTHORIZATION_PORT');

export type FolderProjectionAuthorizationProblemCodeV1 = 'POLICY_UNAVAILABLE' | 'PROJECTION_DENIED';

export type FolderProjectionAuthorizationResultV1 =
  | {
      readonly accepted: true;
      /** Effective mode is resolved by the server; the request is only a mode hint. */
      readonly dataMode: 'LOCAL' | 'CLOUD' | 'HYBRID';
      /** This value is server policy output, never a request field. */
      readonly contentAllowed: boolean;
    }
  | {
      readonly accepted: false;
      readonly code: FolderProjectionAuthorizationProblemCodeV1;
    };

export interface FolderProjectionAuthorizationPortV1 {
  authorize(input: {
    readonly context: IamTenantContextV1;
    readonly bindingId: string;
    readonly sourceId: string;
    readonly requestedDataMode: 'LOCAL' | 'CLOUD' | 'HYBRID';
  }): Promise<FolderProjectionAuthorizationResultV1>;
}

/** Safe default until DdaModule composes DSO policy and source authorization. */
export class UnavailableFolderProjectionAuthorizationAdapter
  implements FolderProjectionAuthorizationPortV1
{
  public async authorize(input: {
    readonly context: IamTenantContextV1;
    readonly bindingId: string;
    readonly sourceId: string;
    readonly requestedDataMode: 'LOCAL' | 'CLOUD' | 'HYBRID';
  }): Promise<FolderProjectionAuthorizationResultV1> {
    void input;
    await Promise.resolve();
    return Object.freeze({ accepted: false, code: 'POLICY_UNAVAILABLE' as const });
  }
}
