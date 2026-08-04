export type IamInvitationProblemCodeV1 =
  | 'INVITATION_REQUEST_REJECTED'
  | 'INVITATION_SCOPE_DENIED'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_CONFLICT'
  | 'INVITATION_DELIVERY_UNAVAILABLE'
  | 'INVITATION_UNAVAILABLE';

export class InvitationProblemError extends Error {
  public constructor(readonly code: IamInvitationProblemCodeV1) {
    super(code);
    this.name = 'InvitationProblemError';
  }
}
